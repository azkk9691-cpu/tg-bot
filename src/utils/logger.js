/**
 * Structured Logger with Timestamp & Colors
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function getTimestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

export const logger = {
  info: (message, meta = '') => {
    console.log(
      `${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.green}[INFO]${colors.reset} ${message}`,
      meta ? meta : ''
    );
  },
  warn: (message, meta = '') => {
    console.warn(
      `${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.yellow}[WARN]${colors.reset} ${message}`,
      meta ? meta : ''
    );
  },
  error: (message, error = '') => {
    console.error(
      `${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.red}[ERROR]${colors.reset} ${message}`,
      error ? error : ''
    );
  },
  debug: (message, meta = '') => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(
        `${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.blue}[DEBUG]${colors.reset} ${message}`,
        meta ? meta : ''
      );
    }
  },
};
