import { describe, it, expect } from 'vitest';
import { pickEnglishVoice, voiceScore, normalizeLang, SPEECH_LANG } from '../../public/lib/voices.js';

const v = (name, lang, extra = {}) => ({ name, lang, localService: true, default: false, ...extra });

// What an iPhone set to Turkish lists (shortened): the default voice is Turkish, novelty voices come first.
const IPHONE_TR = [
  v('Yelda', 'tr-TR', { default: true }),
  v('Albert', 'en-US'),
  v('Bad News', 'en-US'),
  v('Daniel', 'en-GB'),
  v('Eddy (English (US))', 'en-US'),
  v('Samantha', 'en-US'),
  v('Anna', 'de-DE'),
];

describe('pickEnglishVoice', () => {
  it('speaks English on a Turkish iPhone: Samantha, not the Turkish default or a joke voice', () => {
    expect(pickEnglishVoice(IPHONE_TR).name).toBe('Samantha');
  });

  it('prefers en-US over en-GB', () => {
    expect(pickEnglishVoice([v('Daniel', 'en-GB'), v('Google US English', 'en-US', { localService: false })]).name)
      .toBe('Google US English');
  });

  it('falls back to en-GB, then any English voice', () => {
    expect(pickEnglishVoice([v('Yelda', 'tr-TR'), v('Daniel', 'en-GB'), v('Karen', 'en-AU')]).name).toBe('Daniel');
    expect(pickEnglishVoice([v('Yelda', 'tr-TR'), v('Karen', 'en-AU')]).name).toBe('Karen');
  });

  it('understands Android-style language codes (en_US)', () => {
    expect(pickEnglishVoice([v('Türkçe', 'tr_TR'), v('English United States', 'en_US')]).name).toBe('English United States');
  });

  it('never picks a novelty voice, even if it is the only English one', () => {
    expect(pickEnglishVoice([v('Yelda', 'tr-TR'), v('Zarvox', 'en-US'), v('Bubbles', 'en-US')])).toBeNull();
  });

  it('uses a robotic voice only when nothing better exists', () => {
    expect(pickEnglishVoice([v('Eddy (English (US))', 'en-US'), v('Samantha', 'en-US')]).name).toBe('Samantha');
    expect(pickEnglishVoice([v('Eddy (English (US))', 'en-US')]).name).toBe('Eddy (English (US))');
  });

  it('returns null for no voices yet (Chrome loads them late) or garbage', () => {
    expect(pickEnglishVoice([])).toBeNull();
    expect(pickEnglishVoice(undefined)).toBeNull();
    expect(pickEnglishVoice([null, {}])).toBeNull();
  });
});

describe('helpers', () => {
  it('normalizeLang', () => {
    expect(normalizeLang('en_US')).toBe('en-us');
    expect(normalizeLang(undefined)).toBe('');
  });
  it('non-English voices score -1', () => {
    expect(voiceScore(v('Yelda', 'tr-TR'))).toBe(-1);
    expect(voiceScore(v('Engl', 'eng'))).toBe(-1); // not an "en" code
  });
  it('the app language is US English', () => expect(SPEECH_LANG).toBe('en-US'));
});
