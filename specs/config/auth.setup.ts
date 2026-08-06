import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { LoginPage } from '@ui/page-objects/login.page';
import { STORAGE_STATE_PATH } from '@utils/constants';

const username = process.env.USER_NAME;
const password = process.env.USER_PASSWORD;

setup('authenticate with Azure', async ({ page }) => {
  expect(username, 'USER_NAME must be configured in .env.').toBeTruthy();
  expect(password, 'USER_PASSWORD must be configured in .env.').toBeTruthy();

  const loginPage = new LoginPage(page);
  await loginPage.open();
  await loginPage.signIn(username!, password!);

  await fs.mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
