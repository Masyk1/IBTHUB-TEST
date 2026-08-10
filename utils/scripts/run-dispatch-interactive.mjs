import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

const prompt = createInterface({ input, output });

/**
 * @param {string} month
 * @param {string} day
 * @returns {string}
 */
function parseDispatchDate(month, day) {
  if (!/^(0?[1-9]|1[0-2])$/.test(month)) {
    throw new Error('Month must be between 1 and 12.');
  }
  if (!/^(0?[1-9]|[12]\d|3[01])$/.test(day)) {
    throw new Error('Day must be between 1 and 31.');
  }

  const year = new Date().getFullYear();
  const normalizedMonth = month.padStart(2, '0');
  const normalizedDay = day.padStart(2, '0');
  const date = `${year}-${normalizedMonth}-${normalizedDay}`;
  const parsed = new Date(`${date}T12:00:00`);
  if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== Number(month) || parsed.getDate() !== Number(day)) {
    throw new Error(`${date} is not a valid calendar date.`);
  }
  return date;
}

try {
  const month = (await prompt.question('For which month should the test run? (1-12): ')).trim();
  const day = (await prompt.question('For which day should the test run? (1-31): ')).trim();
  const imageChoice = (await prompt.question('Check image links? (Y/N): ')).trim().toLowerCase();
  if (!['y', 'yes', 'n', 'no'].includes(imageChoice)) {
    throw new Error('Image link choice must be Y/Yes or N/No.');
  }
  const dispatchDate = parseDispatchDate(month, day);
  const waitForImages = imageChoice === 'y' || imageChoice === 'yes';
  const imagePageWorkers = '15';
  prompt.close();

  console.log(
    `\nStarting the complete IBT Hub test suite for ${dispatchDate} ${waitForImages ? `with image link verification (${imagePageWorkers} parallel pages)` : 'without image link verification'}...\n`
  );
  const playwrightCli = fileURLToPath(new URL('../../node_modules/@playwright/test/cli.js', import.meta.url));
  const browserArguments = process.argv.includes('--headed') ? ['--headed'] : [];
  const child = spawn(process.execPath, [playwrightCli, 'test', ...browserArguments], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DISPATCH_DATE: dispatchDate,
      WAIT_FOR_IMAGES: String(waitForImages),
      IMAGE_PAGE_WORKERS: imagePageWorkers,
    },
  });

  child.on('exit', (code) => process.exit(code ?? 1));
  child.on('error', (error) => {
    console.error(`Could not start Playwright: ${error.message}`);
    process.exit(1);
  });
} catch (error) {
  prompt.close();
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
