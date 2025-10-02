import { getLogger } from '../Loggers';

import * as irc from '../libs/irc';
import { OahrCli } from './OahrCli';
import { OahrHeadless } from './OahrHeadless';
import { logIrcEvent, logPrivateMessage } from '../IIrcClient';
import { CONFIG_OPTION, getIrcConfig } from '../TypedConfig';
import { applySpeedLimit } from '../libs/ChatLimiter';

const logger = getLogger('预检');
logger.info('启动中...');

try {
  CONFIG_OPTION.USE_ENV = true;
  const c = getIrcConfig();
  if (c.nick === 'your account id' || c.opt.password === 'you can get password from \'https://osu.ppy.sh/p/irc\'') {
    logger.error('你必须在配置文件中配置你的账号和IRC密码.');
    logger.error('你可以在此处 \'https://osu.ppy.sh/p/irc\' 获得你的IRC密码 ');
    logger.error('将 config/default.json 复制为 config/local.json, 配置你的账号和IRC密码.');
    process.exit(1);
  }

  const client = new irc.Client(c.server, c.nick, c.opt);
  client.on('error', err => {
    if (err.command === 'err_passwdmismatch') {
      logger.error(`${err.command}: ${err.args.join(' ')}`);
      logger.error('Check your account ID and IRC password.');
      process.exit(1);
    }
  });

  applySpeedLimit(client, 10, 5000);

  logIrcEvent(client);
  logPrivateMessage(client);

  if (process.argv.length > 2) {
    const command = process.argv[2];
    const oahr = new OahrHeadless(client);
    const arg = process.argv.slice(3).join(' ');
    oahr.start(command, arg);
  } else {
    const oahr = new OahrCli(client);
    oahr.start(null);
  }
} catch (e: any) {
  logger.error(`@cli-index\n${e}`);
  process.exit(1);
}
