import { emit, EventType } from './events';
import { join } from 'path';
import { isDebugMode } from './config';
import { readJSONSync } from 'fs-extra';
import * as chalk from 'chalk';


export class BuildError extends Error {
  hasBeenLogged = false;
  updatedDiagnostics = false;

  constructor(err?: any) {
    super();
    if (err) {
      if (err.message) {
        this.message = err.message;
      } else if (err) {
        this.message = err;
      }
      if (err.stack) {
        this.stack = err.stack;
      }
      if (err.name) {
        this.name = err.name;
      }
      if (typeof err.hasBeenLogged === 'boolean') {
        this.hasBeenLogged = err.hasBeenLogged;
      }
      if (typeof err.updatedDiagnostics === 'boolean') {
        this.updatedDiagnostics = err.updatedDiagnostics;
      }
    }
  }

  toJson() {
    return {
      message: this.message,
      name: this.name,
      stack: this.stack,
      hasBeenLogged: this.hasBeenLogged,
      updatedDiagnostics: this.updatedDiagnostics
    };
  }
}

/* There are special cases where strange things happen where we don't want any logging, etc.
 * For our sake, it is much easier to get off the happy path of code and just throw an exception
 * and do nothing with it
 */
export class IgnorableError extends Error {
  constructor(msg?: string) {
    super(msg);
  }
}



export class Logger {
  private start: number;
  private scope: string;

  constructor(scope: string) {
    this.start = Date.now();
    this.scope = scope;
    let msg = `${scope} started ${chalk.dim('...')}`;
    if (isDebugMode()) {
      msg += memoryUsage();
    }
    Logger.info(msg);

    const taskEvent: TaskEvent = {
      scope: this.scope.split(' ')[0],
      type: 'start',
      msg: `${scope} started ...`
    };
    emit(EventType.TaskEvent, taskEvent);
  }

  ready(chalkColor?: Function) {
    this.completed('ready', chalkColor);
  }

  finish(chalkColor?: Function) {
    this.completed('finished', chalkColor);
  }

  private completed(type: string, chalkColor: Function) {

    const taskEvent: TaskEvent = {
      scope: this.scope.split(' ')[0],
      type: type
    };

    taskEvent.duration = Date.now() - this.start;

    if (taskEvent.duration > 1000) {
      taskEvent.time = 'in ' + (taskEvent.duration / 1000).toFixed(2) + ' s';

    } else {
      let ms = parseFloat((taskEvent.duration).toFixed(3));
      if (ms > 0) {
        taskEvent.time = 'in ' + taskEvent.duration + ' ms';
      } else {
        taskEvent.time = 'in less than 1 ms';
      }
    }

    taskEvent.msg = `${this.scope} ${taskEvent.type} ${taskEvent.time}`;
    emit(EventType.TaskEvent, taskEvent);

    let msg = `${this.scope} ${type}`;
    if (chalkColor) {
      msg = chalkColor(msg);
    }

    msg += ' ' + chalk.dim(taskEvent.time);

    if (isDebugMode()) {
      msg += memoryUsage();
    }

    Logger.info(msg);
  }

  fail(err: Error) {
    if (err) {
      if (err instanceof IgnorableError) {
        return;
      }

      // only emit the event if it's a valid error
      const taskEvent: TaskEvent = {
        scope: this.scope.split(' ')[0],
        type: 'failed',
        msg: this.scope + ' failed'
      };
      emit(EventType.TaskEvent, taskEvent);

      if (err instanceof BuildError) {
        let failedMsg = `${this.scope} failed`;
        if (err.message) {
          failedMsg += `: ${err.message}`;
        }

        if (!err.hasBeenLogged) {
          Logger.error(`${failedMsg}`);

          err.hasBeenLogged = true;

          if (err.stack && isDebugMode()) {
            Logger.debug(err.stack);
          }

        } else if (isDebugMode()) {
          Logger.debug(`${failedMsg}`);
        }
        return err;
      }
    }

    return err;
  }

  /**
   * Does not print out a time prefix or color any text. Only prefix
   * with whitespace so the message is lined up with timestamped logs.
   */
  static log(...msg: any[]) {
    Logger.wordWrap(msg).forEach(line => {
      console.log(line);
    });
  }

  /**
   * Prints out a dim colored timestamp prefix.
   */
  static info(...msg: any[]) {
    const lines = Logger.wordWrap(msg);
    if (lines.length) {
      let prefix = timePrefix();
      lines[0] = chalk.dim(prefix) + lines[0].substr(prefix.length);
    }
    lines.forEach(line => {
      console.log(line);
    });
  }

  /**
   * Prints out a yellow colored timestamp prefix.
   */
  static warn(...msg: any[]) {
    const lines = Logger.wordWrap(msg);
    if (lines.length) {
      let prefix = timePrefix();
      lines[0] = prefix + lines[0].substr(prefix.length);
    }
    lines.forEach(line => {
      console.warn(chalk.yellow(line));
    });
  }

  /**
   * Prints out a error colored timestamp prefix.
   */
  static error(...msg: any[]) {
    const lines = Logger.wordWrap(msg);
    if (lines.length) {
      let prefix = timePrefix();
      lines[0] = prefix + lines[0].substr(prefix.length);
      if (isDebugMode()) {
        lines[0] += memoryUsage();
      }
    }
    lines.forEach(line => {
      console.error(chalk.red(line));
    });
  }

  /**
   * Prints out a blue colored DEBUG prefix. Only prints out when debug mode.
   */
  static debug(...msg: any[]) {
    if (isDebugMode()) {
      msg.push(memoryUsage());

      const lines = Logger.wordWrap(msg);
      if (lines.length) {
        let prefix = '[ DEBUG! ]';
        lines[0] = prefix + lines[0].substr(prefix.length);
      }
      lines.forEach(line => {
        console.log(chalk.cyan(line));
      });
    }
  }

  static wordWrap(msg: any[]) {
    const output: string[] = [];

    const words: any[] = [];
    msg.forEach(m => {
      if (m === null) {
        words.push('null');

      } else if (typeof m === 'undefined') {
        words.push('undefined');

      } else if (typeof m === 'string') {
        m.replace(/\s/gm, ' ').split(' ').forEach(strWord => {
          if (strWord.trim().length) {
            words.push(strWord.trim());
          }
        });

      } else if (typeof m === 'number' || typeof m === 'boolean') {
        words.push(m.toString());

      } else if (typeof m === 'function') {
        words.push(m.toString());

      } else if (Array.isArray(m)) {
        words.push(() => {
          return m.toString();
        });

      } else if (Object(m) === m) {
        words.push(() => {
          return m.toString();
        });

      } else {
        words.push(m.toString());
      }
    });

    let line = Logger.INDENT;
    words.forEach(word => {
      if (typeof word === 'function') {
        if (line.trim().length) {
          output.push(line);
        }
        output.push(word());
        line = Logger.INDENT;

      } else if (Logger.INDENT.length + word.length > Logger.MAX_LEN) {
        // word is too long to play nice, just give it its own line
        if (line.trim().length) {
          output.push(line);
        }
        output.push(Logger.INDENT + word);
        line = Logger.INDENT;

      } else if ((word.length + line.length) > Logger.MAX_LEN) {
        // this word would make the line too long
        // print the line now, then start a new one
        output.push(line);
        line = Logger.INDENT + word + ' ';

      } else {
        line += word + ' ';
      }
    });
    if (line.trim().length) {
      output.push(line);
    }
    return output;
  }


  static formatFileName(rootDir: string, fileName: string) {
    fileName = fileName.replace(rootDir, '');
    if (/\/|\\/.test(fileName.charAt(0))) {
      fileName = fileName.substr(1);
    }
    if (fileName.length > 80) {
      fileName = '...' + fileName.substr(fileName.length - 80);
    }
    return fileName;
  }


  static formatHeader(type: string, fileName: string, rootDir: string, startLineNumber: number = null, endLineNumber: number = null) {
    let header = `${type}: ${Logger.formatFileName(rootDir, fileName)}`;

    if (startLineNumber !== null && startLineNumber > 0) {
      if (endLineNumber !== null && endLineNumber > startLineNumber) {
        header += `, lines: ${startLineNumber} - ${endLineNumber}`;
      } else {
        header += `, line: ${startLineNumber}`;
      }
    }

    return header;
  }


  static newLine() {
    console.log('');
  }

  static INDENT = '            ';
  static MAX_LEN = 120;

}


function timePrefix() {
  const date = new Date();
  return '[' + ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2) + ':' + ('0' + date.getSeconds()).slice(-2) + ']';
}


function memoryUsage() {
  return chalk.dim(` MEM: ${(process.memoryUsage().rss / 1000000).toFixed(1)}MB`);
}


export function getAppScriptsVersion() {
  let rtn = '';
  try {
    const packageJson = readJSONSync(join(__dirname, '..', '..', 'package.json'));
    rtn = packageJson.version || '';
  } catch (e) {}
  return rtn;
}


export interface TaskEvent {
  scope: string;
  type: string;
  duration?: number;
  time?: string;
  msg?: string;
}


export interface Diagnostic {
  level: string;
  syntax: string;
  type: string;
  header: string;
  code: string;
  messageText: string;
  absFileName: string;
  relFileName: string;
  lines: PrintLine[];
}


export interface PrintLine {
  lineIndex: number;
  lineNumber: number;
  text: string;
  errorCharStart: number;
  errorLength: number;
}

