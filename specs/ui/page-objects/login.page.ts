import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  private readonly azureSignInButton: Locator;
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  private readonly visibleCredentialInput: Locator;
  private readonly microsoftPrimaryButton: Locator;
  private readonly staySignedInNoButton: Locator;
  private readonly ibtHubBrandLink: Locator;

  constructor(page: Page) {
    super(page);
    this.azureSignInButton = page.getByRole('button', { name: 'Sign In with Azure', exact: true });
    this.emailInput = page.locator(
      'input#i0116:not(.moveOffScreen):not([aria-hidden="true"]), input[name="loginfmt"]:not(.moveOffScreen):not([aria-hidden="true"])'
    );
    this.passwordInput = page.locator(
      'input#i0118:not(.moveOffScreen):not([aria-hidden="true"]), input[name="passwd"]:not(.moveOffScreen):not([aria-hidden="true"])'
    );
    this.visibleCredentialInput = this.emailInput.or(this.passwordInput);
    this.microsoftPrimaryButton = page.locator('#idSIButton9:visible');
    this.staySignedInNoButton = page.locator('#idBtn_Back');
    this.ibtHubBrandLink = page.locator('a.navbar-brand[href="/jobnumbers"]', {
      hasText: 'Graniterock IBT Hub',
    });
  }

  async toBeLoaded(): Promise<void> {
    await expect(this.azureSignInButton).toBeVisible();
  }

  async signIn(username: string, password: string): Promise<void> {
    await this.azureSignInButton.click();

    // Microsoft may remember the account and navigate directly to the password step.
    await expect(this.visibleCredentialInput).toBeVisible({ timeout: 30_000 });
    if (await this.emailInput.isVisible()) {
      await this.emailInput.fill(username);
      await expect(this.emailInput).toHaveValue(username);
      await expect(this.microsoftPrimaryButton).toBeEnabled();
      await this.microsoftPrimaryButton.click();
    }

    await expect(this.passwordInput).toBeVisible({ timeout: 30_000 });
    await this.passwordInput.fill('');
    await this.passwordInput.pressSequentially(password, { delay: 20 });
    await this.passwordInput.press('Tab');
    await expect(this.microsoftPrimaryButton).toBeEnabled({ timeout: 30_000 });
    await this.microsoftPrimaryButton.click();

    // The "Stay signed in?" prompt is not guaranteed to appear for every session.
    const staySignedInPromptIsVisible = await this.staySignedInNoButton
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (staySignedInPromptIsVisible) {
      await this.staySignedInNoButton.click();
    }

    await expect(this.page).toHaveURL(/^https:\/\/(?:mi|www)\.grcinspections\.com\/jobnumbers(?:[/?#]|$)/i, {
      timeout: 45_000,
    });
    await expect(this.ibtHubBrandLink).toBeVisible({ timeout: 45_000 });
  }
}
