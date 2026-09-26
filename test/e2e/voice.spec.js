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

test('always English: a Turkish phone whose voices load late still gets an en-US voice; recognition is en-US', async ({ page }) => {
  await page.addInitScript(() => {
    // A phone set to Turkish: Turkish default voice, joke voices listed first, voices arrive late (like Chrome).
    const VOICES = [
      { name: 'Yelda', lang: 'tr-TR', default: true, localService: true },
      { name: 'Albert', lang: 'en-US', default: false, localService: true },
      { name: 'Daniel', lang: 'en-GB', default: false, localService: true },
      { name: 'Samantha', lang: 'en-US', default: false, localService: true },
    ];
    let voices = [];
    const listeners = [];
    window.__utterances = [];
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.lang = ''; this.voice = null; } };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak(u) { window.__utterances.push({ text: u.text, lang: u.lang, voice: u.voice?.name || null }); setTimeout(() => u.onend?.(), 20); },
        cancel() {},
        getVoices() { return voices; },
        addEventListener(type, fn) { if (type === 'voiceschanged') listeners.push(fn); },
      },
    });
    window.__loadVoices = () => { voices = VOICES; listeners.forEach((fn) => fn()); };
    class FakeRecognition {
      start() { window.__recLang = this.lang; setTimeout(() => { this.onresult?.({ results: [[{ transcript: 'help' }]] }); this.onend?.(); }, 30); }
      abort() {}
    }
    window.SpeechRecognition = FakeRecognition;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect.poll(() => page.evaluate(() => window.__utterances.length)).toBeGreaterThan(0);
  // before the voices arrive: still asks for English
  expect(await page.evaluate(() => window.__utterances.every((u) => u.lang === 'en-US'))).toBe(true);

  await page.evaluate(() => window.__loadVoices());
  await page.evaluate(() => window.crosswise.speak('Route stopped.'));
  const last = await page.evaluate(() => window.__utterances.at(-1));
  expect(last).toEqual({ text: 'Route stopped.', lang: 'en-US', voice: 'Samantha' });

  await page.getByRole('button', { name: 'Speak a command' }).click();
  await expect(page.locator('#status')).toContainText('You can say');
  expect(await page.evaluate(() => window.__recLang)).toBe('en-US');
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
