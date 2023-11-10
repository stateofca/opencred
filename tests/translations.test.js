import {describe, it} from 'mocha';
import expect from 'expect.js';

import {combineTranslations} from '../config/translation.js';

describe('Translations', async () => {
  it('should combine default and custom translations', () => {
    const exampleDefaults = {
      en: {
        turnipsAvailable: 'Turnips are available for 99 bells each',
        turnipsNotAvailable: 'Turnips are not available right now',
      }
    };

    const customTranslations = {
      en: {
        turnipsNotAvailable: 'We are out of turnips'
      }
    };

    const combined = combineTranslations(customTranslations, exampleDefaults);
    expect(combined.en.turnipsAvailable)
      .to.equal('Turnips are available for 99 bells each');

  });

  it('should add a language defined custom if not in defaults', () => {
    const exampleDefaults = {
      en: {
        turnipsAvailable: 'Turnips are available for 99 bells each',
        turnipsNotAvailable: 'Turnips are not available right now',
      }
    };

    const customTranslations = {
      en: {
        turnipsNotAvailable: 'We are out of turnips'
      },
      fr: {
        turnipsAvailable: 'Les navets sont disponibles pour 99 cloches chacun',
        turnipsNotAvailable:
          'Les navets ne sont pas disponibles en ce moment',
      }
    };

    const combined = combineTranslations(customTranslations, exampleDefaults);
    expect(combined.fr.turnipsAvailable)
      .to.equal('Les navets sont disponibles pour 99 cloches chacun');
  });

  it('should backfill from en if not in custom lang', () => {
    const exampleDefaults = {
      en: {
        turnipsAvailable: 'Turnips are available for 99 bells each',
        turnipsNotAvailable: 'Turnips are not available right now',
      }
    };

    const customTranslations = {
      fr: {
        turnipsAvailable: 'Les navets sont disponibles pour 99 cloches chacun',
      }
    };

    const combined = combineTranslations(customTranslations, exampleDefaults);
    expect(combined.fr.turnipsNotAvailable)
      .to.equal('Turnips are not available right now');
  });
});
