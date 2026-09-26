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

test('"take me to Hauptbahnhof" → did you mean → yes → plans the safest route, speaks the summary, asks to start', async ({ page }) => {
  await fakeSpeech(page);
  await fakeRecognition(page, ['take me to Hauptbahnhof', 'yes', 'no']);
  await mockOrs(page);
  await start(page);
  await page.getByRole('button', { name: 'Speak a command' }).click();
  await expect(page.locator('#routes > li')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => window.__spoken.join(' | ')))
    .toMatch(/Did you mean Wien Hauptbahnhof, Main station, Favoriten, Vienna\?.*Say yes or no\..*The recommended route is 1 minute longer.*Shall I start the recommended option, the walking route\? Say yes or no\..*OK\. The options are on the screen/);
  await expect(page.getByLabel('Destination', { exact: true })).toHaveValue('Wien Hauptbahnhof');
  await expect(page.locator('#confirm')).toBeHidden();
});

// ---- "I want to go to …": understand it, check with "did you mean", start from here on "yes" ----

test('"i want go to hauptbahnhof" → Did you mean …? → "yes" → planned from my location → "yes" → guidance starts', async ({ page, context }) => {
  await fakeSpeech(page);
  await fakeRecognition(page, ['i want go to hauptbahnhof', 'yeah', 'yes please']);
  const calls = await mockOrs(page);
  await context.setGeolocation({ latitude: 48.17612, longitude: 16.39519 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Speak a command' }).click();
  await expect(page.locator('#nav-section')).toBeVisible({ timeout: 15_000 }); // walking guidance started by voice
  expect(calls[0].from).toBe('16.39519,48.17612'); // from the GPS position, not from anything typed
  const spoken = await page.evaluate(() => window.__spoken.join(' | '));
  expect(spoken).toMatch(/Looking up hauptbahnhof\./);
  expect(spoken).toMatch(/Did you mean Wien Hauptbahnhof, Main station, Favoriten, Vienna\? It is about 1\.\d kilometres from here\. Say yes or no\./);
  expect(spoken).toMatch(/Starting the route/);
});

test('"no" offers the next match, then asks for the place again; a bare place name is understood', async ({ page }) => {
  await fakeSpeech(page);
  await fakeRecognition(page, ['I would like to go to the main station please', 'no', 'no', 'Hauptbahnhof', 'yes', 'no']);
  await mockOrs(page);
  await page.route('**/api/geocode?*', (route) => route.fulfill({ // two different places for the same words
    json: { results: [
      { label: 'Wien Hauptbahnhof, Vienna, Austria', name: 'Wien Hauptbahnhof', lon: 16.3755, lat: 48.185 },
      { label: 'Hauptbahnhof Wiener Neustadt, Wiener Neustadt, Austria', name: 'Hauptbahnhof Wiener Neustadt', lon: 16.2345, lat: 47.8113 },
    ] },
  }));
  await start(page);
  await page.getByRole('button', { name: 'Speak a command' }).click();
  await expect(page.locator('#routes > li')).toHaveCount(3, { timeout: 15_000 });
  const spoken = await page.evaluate(() => window.__spoken.join(' | '));
  expect(spoken).toMatch(/Did you mean Wien Hauptbahnhof, Main station.*\| Then did you mean Hauptbahnhof Wiener Neustadt, Wiener Neustadt\? It is about \d+\.\d kilometres from here.*\| Sorry\. Where do you want to go\?.*Looking up hauptbahnhof.*Did you mean Wien Hauptbahnhof/);
});

test('"I want to go somewhere" → "Where do you want to go?" → place → did you mean → yes', async ({ page }) => {
  await fakeSpeech(page);
  await fakeRecognition(page, ['I want to go somewhere', 'Hauptbahnhof', 'yes', 'no']);
  await mockOrs(page);
  await start(page);
  await page.getByRole('button', { name: 'Speak a command' }).click();
  await expect(page.locator('#routes > li')).toHaveCount(3, { timeout: 15_000 });
  expect(await page.evaluate(() => window.__spoken.join(' | '))).toMatch(/Where do you want to go\?.*Did you mean Wien Hauptbahnhof/);
});

test('a sentence dictated into the search box ("I want to go to Hauptbahnhof") → did you mean → Yes button → planned', async ({ page }) => {
  await fakeSpeech(page);
  await mockOrs(page);
  await start(page);
  await page.getByLabel('Destination', { exact: true }).fill('I want to go to Hauptbahnhof');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('#confirm')).toBeVisible();
  await expect(page.locator('#confirm-question')).toHaveText('Did you mean Wien Hauptbahnhof?');
  await expect(page.locator('#confirm-detail')).toContainText('km away');
  await expect(page.locator('#confirm-question')).toBeFocused(); // screen readers land on the question
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page.locator('#routes > li')).toHaveCount(3);
  await expect(page.getByLabel('Destination', { exact: true })).toHaveValue('Wien Hauptbahnhof');
  // then: "Start walking?" with the same buttons
  await expect(page.locator('#confirm-question')).toHaveText('Start walking?');
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await expect(page.locator('#confirm')).toBeHidden();
});

test('"by bus": public transport first even for a short walk; "on foot": walking only', async ({ page }) => {
  await fakeSpeech(page);
  await fakeRecognition(page, ['take me to Hauptbahnhof by bus', 'yes', 'no']);
  const transitCalls = [];
  await mockOrs(page, { transit: 'hoiv-hbf' });
  page.on('request', (r) => { if (r.url().includes('/api/transit')) transitCalls.push(r.url()); });
  await start(page);
  await page.getByRole('button', { name: 'Speak a command' }).click();
  await expect(page.locator('#options > li').first().locator('h3')).toHaveText(/^Recommended · Bus 69A/, { timeout: 15_000 });
  expect(transitCalls.length).toBe(1);
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
