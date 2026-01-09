/**
 * Output utilities for cry
 *
 * Provides consistent, colorful terminal output without external dependencies.
 */

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

// Check if colors should be used
const useColors = process.stdout.isTTY && !process.env.NO_COLOR;

function colorize(text: string, ...codes: string[]): string {
  if (!useColors) return text;
  return codes.join('') + text + colors.reset;
}

export const fmt = {
  bold: (text: string) => colorize(text, colors.bold),
  dim: (text: string) => colorize(text, colors.dim),
  red: (text: string) => colorize(text, colors.red),
  green: (text: string) => colorize(text, colors.green),
  yellow: (text: string) => colorize(text, colors.yellow),
  blue: (text: string) => colorize(text, colors.blue),
  magenta: (text: string) => colorize(text, colors.magenta),
  cyan: (text: string) => colorize(text, colors.cyan),
  gray: (text: string) => colorize(text, colors.gray),

  success: (text: string) => colorize(text, colors.green),
  error: (text: string) => colorize(text, colors.red),
  warn: (text: string) => colorize(text, colors.yellow),
  info: (text: string) => colorize(text, colors.cyan),
  path: (text: string) => colorize(text, colors.blue),
  branch: (text: string) => colorize(text, colors.magenta),
};

export function log(message: string): void {
  console.log(message);
}

export function success(message: string): void {
  console.log(fmt.green('✓') + ' ' + message);
}

export function error(message: string): void {
  console.error(fmt.red('✗') + ' ' + message);
}

export function warn(message: string): void {
  console.log(fmt.yellow('⚠') + ' ' + message);
}

export function info(message: string): void {
  console.log(fmt.cyan('ℹ') + ' ' + message);
}

export function header(message: string): void {
  console.log('\n' + fmt.bold(message));
}

export function list(items: string[], prefix = '  '): void {
  for (const item of items) {
    console.log(prefix + '• ' + item);
  }
}

export function table(rows: string[][], columnWidths?: number[]): void {
  if (rows.length === 0) return;

  // Calculate column widths if not provided
  const widths = columnWidths ?? rows[0].map((_, i) =>
    Math.max(...rows.map(row => (row[i] ?? '').length))
  );

  for (const row of rows) {
    const paddedCells = row.map((cell, i) =>
      (cell ?? '').padEnd(widths[i] ?? 0)
    );
    console.log('  ' + paddedCells.join('  '));
  }
}

export function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function newline(): void {
  console.log();
}
