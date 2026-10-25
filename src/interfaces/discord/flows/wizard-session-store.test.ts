import { describe, expect, it } from 'vitest';
import { startWizard } from './configure-wizard.js';
import { WizardSessionStore } from './wizard-session-store.js';

describe('WizardSessionStore', () => {
  it('keeps one session per admin and server until it expires', () => {
    let now = 0;
    const store = new WizardSessionStore(() => now, 1000);
    const state = startWizard({}, null);

    store.set('g', 'u', state);
    expect(store.get('g', 'u')).toBe(state);
    expect(store.get('g', 'other')).toBeNull();

    now = 1000;
    expect(store.get('g', 'u')).toBeNull();
  });

  it('forgets deleted and stale sessions', () => {
    let now = 0;
    const store = new WizardSessionStore(() => now, 1000);
    store.set('g', 'a', startWizard({}, null));
    store.delete('g', 'a');
    expect(store.get('g', 'a')).toBeNull();

    store.set('g', 'b', startWizard({}, null));
    now = 2000;
    store.set('g', 'c', startWizard({}, null));
    expect(store.get('g', 'b')).toBeNull();
    expect(store.get('g', 'c')).not.toBeNull();
  });
});
