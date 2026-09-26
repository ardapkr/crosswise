// Voice commands with a fake SpeechRecognition that "hears" scripted phrases.
import { test, expect } from '@playwright/test';
import { fakeSpeech, mockOrs } from './helpers.js';

/** Each start() of the recogniser returns the next phrase (as 1–3 alternatives). */
async function fakeRecognition(page, phrases) {
  await page.addInitScript((list) => {
    let n = 0;
    class FakeRecognition {
      start() {
        const item = list[Math.min(n++, list.length - 1)];
        const alternatives = (Array.isArray(item) ? item : [item]).map((transcript) => ({ transcript, confidence: 0.9 }));
        setTimeout(() => {
          this.onresult?.({ results: [alternatives] });
          this.onend?.();
        }, 50);
      }
      abort() { this.onend?.(); }
      stop() { this.onend?.(); }
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = FakeRecognition;
  }, phrases);
}

async function start(page) {
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Start' }).click();
}

test('"find my bus 13 a" starts the bus scan for 13A', async ({ page }) => {
  await fakeSpeech(page);
  await fakeRecognition(page, ['find my bus 13 a']);
  await page.route('**/api/look', (route) => route.fulfill({
    json: { mode: 'bus', result: { status: 'found', line: '13A', destination: '', vehicle: 'bus', confidence: 0.9 } },
  }));
  await start(page);
  await page.getByRole('button', { name: 'Speak a command' }).click();
  await expect(page.locator('#voice-heard')).toHaveText('Heard: “find my bus 13 a”');
  await expect(page.locator('#bus-line')).toHaveValue('13A');
  await expect(page.locator('#status')).toHaveText('This is your bus, 13A.', { timeout: 15_000 });
});

test('"take me to Hauptbahnhof" plans the safest route and speaks the summary', async ({ page }) => {
  await fakeSpeech(page);
  await fakeRecognition(page, ['take me to Hauptbahnhof']);
  await mockOrs(page);
  await start(page);
  await page.getByRole('button', { name: 'Speak a command' }).click();
  await expect(page.locator('#routes > li')).toHaveCount(3);
  await expect(page.locator('#status')).toContainText('The recommended route is 1 minute longer');
  await expect(page.getByLabel('Destination', { exact: true })).toHaveValue('Hauptbahnhof');
});

test('a second guess is used when the first one is not understood; mode switch by voice', async ({ page }) => {
  await fakeSpeech(page);
  await fakeRecognition(page, [['wheel share mode', 'wheelchair mode']]);
  await start(page);
  await page.getByRole('button', { name: 'Speak a command' }).click();
  await expect(page.getByRole('button', { name: 'Wheelchair' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#status')).toHaveText('Wheelchair mode.');
});

test('unknown phrase and help are spoken', async ({ page }) => {
  await fakeSpeech(page);
  await fakeRecognition(page, ['banana pancakes', 'help']);
  await start(page);
  const btn = page.getByRole('button', { name: 'Speak a command' });
  await btn.click();
  await expect(page.locator('#status')).toHaveText('Sorry, I did not understand: banana pancakes. Say help to hear what you can say.');
  await btn.click();
  await expect(page.locator('#status')).toContainText('You can say: find my bus');
});

test('no SpeechRecognition in this browser → friendly fallback message', async ({ page }) => {
  await fakeSpeech(page);
  await page.addInitScript(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  });
  await start(page);
  await page.getByRole('button', { name: 'Speak a command' }).click();
  await expect(page.locator('#status')).toHaveText(
    'Voice commands are not supported in this browser. Use the buttons, or try Chrome on Android or Safari on iPhone.',
  );
});
