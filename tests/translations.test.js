import {describe, it} from 'mocha';
import expect from 'expect.js';

import {combineTranslations} from '../config/translation.js';

describe('Translations', async () => {
  it('should combine default and custom translations', () => {
    const exampleDefaults = {
      en: {
        turnips_available: 'Turnips are available for 99 bells each',
        turnips_not_available: 'Turnips are not available right now',
      }
    };

    const customTranslations = {
      en: {
        turnips_not_available: 'We are out of turnips'
      }
    };

    const combined = combineTranslations(customTranslations, exampleDefaults);
    expect(combined.en.turnips_available)
      .to.equal('Turnips are available for 99 bells each');

  });

  it('should add a language defined custom if not in defaults', () => {
    const exampleDefaults = {
      en: {
        turnips_available: 'Turnips are available for 99 bells each',
        turnips_not_available: 'Turnips are not available right now',
      }
    };

    const customTranslations = {
      en: {
        turnips_not_available: 'We are out of turnips'
      },
      fr: {
        turnips_available: 'Les navets sont disponibles pour 99 cloches chacun',
        turnips_not_available:
          'Les navets ne sont pas disponibles en ce moment',
      }
    };

    const combined = combineTranslations(customTranslations, exampleDefaults);
    expect(combined.fr.turnips_available)
      .to.equal('Les navets sont disponibles pour 99 cloches chacun');
  });

  it('should backfill from en if not in custom lang', () => {
    const exampleDefaults = {
      en: {
        turnips_available: 'Turnips are available for 99 bells each',
        turnips_not_available: 'Turnips are not available right now',
      }
    };

    const customTranslations = {
      fr: {
        turnips_available: 'Les navets sont disponibles pour 99 cloches chacun',
      }
    };

    const combined = combineTranslations(customTranslations, exampleDefaults);
    expect(combined.fr.turnips_not_available)
      .to.equal('Turnips are not available right now');
  });
});
