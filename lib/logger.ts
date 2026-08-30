/**
 * Isomorphic logger service for SSR and CSR
 * Controlled by LOGGER environment variable
 * Set LOGGER=true to enable logging
 */

const isServer = typeof window === 'undefined';

// Determine if logging is enabled
// Default: true (enabled)
// To disable: set LOGGER=false or LOGGER=0
const getLoggerEnabled = (): boolean => {
  if (isServer) {
    // Server-side: check LOGGER var
    // Default true if not set
    return process.env.LOGGER !== 'false' && process.env.LOGGER !== '0';
  } else {
    // Client-side: check window for injected logger flag or localStorage
    // Default true if not explicitly disabled
    try {
      const enabled = (window as any).__KLYSTR_LOGGER_ENABLED__;
      if (enabled === false) return false;
      const stored = localStorage?.getItem('klystr:logger');
      if (stored === 'false') return false;
      return true;
    } catch {
      return true;
    }
  }
};

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  namespace?: string;
  timestamp?: boolean;
  level?: LogLevel;
}

class Logger {
  private enabled: boolean;
  private namespace: string;

  constructor(namespace = 'klystr') {
    this.namespace = namespace;
    this.enabled = getLoggerEnabled();
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const ns = context?.namespace || this.namespace;
    const timestamp = context?.timestamp !== false ? new Date().toISOString() : '';
    const levelUpper = level.toUpperCase().padEnd(5);
    return `[${ns}] ${levelUpper} ${timestamp ? `(${timestamp}) ` : ''}${message}`;
  }

  info(message: string, data?: any, context?: LogContext): void {
    if (!this.enabled) return;
    const formatted = this.formatMessage('info', message, context);
    if (isServer) {
      console.info(formatted, data || '');
    } else {
      console.log(`%c${formatted}`, 'color: #0ea5e9; font-weight: bold;', data || '');
    }
  }

  warn(message: string, data?: any, context?: LogContext): void {
    if (!this.enabled) return;
    const formatted = this.formatMessage('warn', message, context);
    if (isServer) {
      console.warn(formatted, data || '');
    } else {
      console.warn(`%c${formatted}`, 'color: #f59e0b; font-weight: bold;', data || '');
    }
  }

  error(message: string, data?: any, context?: LogContext): void {
    if (!this.enabled) return;
    const formatted = this.formatMessage('error', message, context);
    if (isServer) {
      console.error(formatted, data || '');
    } else {
      console.error(`%c${formatted}`, 'color: #ef4444; font-weight: bold;', data || '');
    }
  }

  debug(message: string, data?: any, context?: LogContext): void {
    if (!this.enabled) return;
    const formatted = this.formatMessage('debug', message, context);
    if (isServer) {
      console.debug(formatted, data || '');
    } else {
      console.debug(`%c${formatted}`, 'color: #8b5cf6; font-weight: bold;', data || '');
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

// Create default logger instance
export const logger = new Logger('klystr');

// Factory for namespaced loggers
export function createLogger(namespace: string): Logger {
  return new Logger(namespace);
}

// Export Logger class for advanced usage
export { Logger };
