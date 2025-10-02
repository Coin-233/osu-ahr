import * as readline from 'readline';
import { IIrcClient } from '../IIrcClient';
import { LobbyStatus } from '../Lobby';
import { getLogger } from '../Loggers';
import { parser } from '../parsers/CommandParser';
import { OahrBase } from './OahrBase';

const logger = getLogger('cli');

const mainMenuCommandsMessage = `
主菜单命令
  [make <房间名>] 创建房间, 例如, 'make 5* auto host rotation'
  [enter <LobbyID>] 加入房间, 例如, 'enter 123456' (只能使用 ID 来加入.)
  [help] 显示本条消息.
  [quit] 退出程序.
`;

const lobbyMenuCommandsMessage = `
房间菜单命令
  [say <消息>] 将消息发送给#Multiplayer.
  [info] 显示程序的当前信息.
  [reorder] 修改Host队伍排序, 例如, 'reorder player1, player2, player3'
  [regulation <regulation command>] 修改谱面的限制, 例如, 'regulation star_min=2 star_max=5 length_min=60 length_max=300' 
  [regulation enable] 启用谱面限制.
  [regulation disable] 关闭谱面限制.
  [close] 房间中无人时关闭房间.
  [close now] 关闭房间并退出程序.
  [quit] 退出程序. (房间不会关闭.)
`;

interface Scene {
  name: string;
  prompt: string;
  action: (line: string) => Promise<void>;
  completer: readline.Completer
}

export class OahrCli extends OahrBase {
  private scene: Scene;

  constructor(client: IIrcClient) {
    super(client);
    this.scene = this.scenes.mainMenu;
  }

  private scenes = {
    mainMenu: {
      name: '',
      prompt: '> ',
      action: async (line: string) => {
        const l = parser.SplitCliCommand(line);
        switch (l.command) {
          case 'm':
          case 'make':
            if (l.arg === '') {
              logger.info('需要填入房间名称, 例如, \'make testlobby\'');
              return;
            }
            try {
              await this.makeLobbyAsync(l.arg);
              this.transitionToLobbyMenu();
            } catch (e: any) {
              logger.info(`创建房间失败:\n${e}`);
              this.scene = this.scenes.exited;
            }
            break;
          case 'e':
          case 'enter':
            try {
              if (l.arg === '') {
                logger.info('请输入房间ID, 例如, \'enter 123456\'');
                return;
              }
              await this.enterLobbyAsync(l.arg);
              this.transitionToLobbyMenu();
            } catch (e: any) {
              logger.info(`无效的ID:\n${e}`);
              this.scene = this.scenes.exited;
            }
            break;
          case 'q':
          case 'quit':
          case 'exit':
            this.scene = this.scenes.exited;
            break;
          case 'h':
          case 'help':
          case 'command':
          case 'commands':
          case '/?':
          case '-?':
          case '?':
            console.log(mainMenuCommandsMessage);
            break;
          case '':
            break;
          default:
            logger.info(`无效的命令: ${line}`);
            break;
        }
      },
      completer: (line: string): readline.CompleterResult => {
        const completions = ['make', 'enter', 'quit', 'exit', 'help'];
        const hits = completions.filter(v => v.startsWith(line));
        return [hits.length ? hits : ['make', 'enter', 'quit', 'help'], line];
      }
    },
    lobbyMenu: {
      name: 'lobbyMenu',
      prompt: '> ',
      action: async (line: string) => {
        const l = parser.SplitCliCommand(line);
        if (this.lobby.status === LobbyStatus.Left || !this.client.conn) {
          this.scene = this.scenes.exited;
          return;
        }
        switch (l.command) {
          case 's':
          case 'say':
            if ((l.arg.startsWith('!') && !l.arg.startsWith('!mp ')) || l.arg.startsWith('*')) {
              this.lobby.RaiseReceivedChatCommand(this.lobby.GetOrMakePlayer(this.client.nick), l.arg);
            } else {
              this.lobby.SendMessage(l.arg);
            }
            break;
          case 'i':
          case 'info':
            this.displayInfo();
            break;
          case 'reorder':
            this.selector.Reorder(l.arg);
            break;
          case 'regulation':
            if (!l.arg) {
              console.log(this.checker.getRegulationDescription());
            } else {
              this.checker.processOwnerCommand('*regulation', l.arg); // TODO check
            }
            break;
          case 'c':
          case 'close':
            if (l.arg === 'now') {
              // close now
              await this.lobby.CloseLobbyAsync();
              this.scene = this.scenes.exited;
            } else if (l.arg.match(/\d+/)) {
              // close after secs
              this.terminator.CloseLobby(parseInt(l.arg) * 1000);
            } else {
              // close after everyone leaves
              this.terminator.CloseLobby();
            }
            break;
          case 'q':
          case 'quit':
            logger.info('quit');
            this.scene = this.scenes.exited;
            break;
          case 'h':
          case 'help':
          case 'command':
          case 'commands':
          case '/?':
          case '-?':
          case '?':
            console.log(lobbyMenuCommandsMessage);
            break;
          case 'check_order':
            this.lobby.historyRepository.calcCurrentOrderAsName().then(r => {
              logger.info(`历史队列 = ${r.join(', ')}`);
              logger.info(`当前队列 = ${this.selector.hostQueue.map(p => p.name).join(', ')}`);
            });
            break;
          case '':
            break;
          default:
            if (l.command.startsWith('!mp')) {
              this.lobby.SendMessage(`!mp ${l.arg}`);
            } else if (l.command.startsWith('!') || l.command.startsWith('*')) {
              this.lobby.RaiseReceivedChatCommand(this.lobby.GetOrMakePlayer(this.client.nick), `${l.command} ${l.arg}`);
            } else {
              console.log(`无效的命令: ${line}`);
            }
            break;
        }
      },
      completer: (line: string): readline.CompleterResult => {
        const completions = ['say', 'info', 'reorder', 'regulation', 'close', 'quit', 'help'];
        const hits = completions.filter(v => v.startsWith(line));
        return [hits.length ? hits : completions, line];
      }
    },

    exited: {
      name: 'exited',
      prompt: 'ended',
      action: async (line: string) => { /* do nothing. */ },
      completer: (line: string): readline.CompleterResult => {
        return [['exit'], line];
      }
    }
  };

  get prompt(): string {
    return this.scene.prompt;
  }

  get exited(): boolean {
    return this.scene === this.scenes.exited;
  }

  start(rl: readline.Interface | null) {
    if (!rl) {
      rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        completer: (line: string) => {
          return this.scene.completer(line);
        }
      });
    }
    const r = rl as readline.Interface;

    logger.trace('等待注册osu!Bancho...');
    logger.info('正在连接osu!Bancho...');
    this.client.once('registered', () => {
      logger.info('已连接. :D');
      console.log('\n=== Welcome to osu-ahr ===');
      console.log(mainMenuCommandsMessage);
      r.setPrompt(this.prompt);
      r.prompt();
    });
    this.client.once('part', () => {
      r.close();
    });

    r.on('line', line => {
      logger.trace(`Scene: ${this.scene.name}, Line: ${line}`);
      this.scene.action(line).then(() => {
        if (!this.exited) {
          r.setPrompt(this.prompt);
          r.prompt();
        } else {
          logger.trace('Closing interface...');
          r.close();
        }
      });
    });
    r.on('close', () => {
      if (this.client) {
        logger.info('Readline closed.');
        if (this.client.conn && !this.client.conn.requestedDisconnect) {
          this.client.disconnect('Goodbye.', () => {
            logger.info('IRC 已断开.');
            process.exit(0);
          });
        } else {
          logger.info('退出中...');
          process.exit(0);
        }
      }
    });
  }

  transitionToLobbyMenu() {
    this.scene = this.scenes.lobbyMenu;
    this.scene.prompt = `${this.lobby.channel || ''} > `;
    console.log(lobbyMenuCommandsMessage);
  }
}
