/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {
  filterTranslationRows,
  getChangedTranslations,
  listTranslationRows,
  serializeTranslationsYaml
} from '../../../web/utils/debug-translations.js';

const MESSAGES = {
  en: {
    greeting: 'Hello',
    farewell: 'Goodbye'
  },
  fr: {
    greeting: 'Bonjour',
    farewell: 'Au revoir'
  }
};

describe('debug-translations', () => {
  describe('listTranslationRows', () => {
    it('should list rows from multiple languages and keys',
      () => {
        const rows = listTranslationRows({messages: MESSAGES});
        expect(rows.length).to.be(4);
        const langs = rows.map(r => r.lang);
        expect(langs).to.contain('en');
        expect(langs).to.contain('fr');
        const keys = rows.map(r => r.key);
        expect(keys).to.contain('greeting');
        expect(keys).to.contain('farewell');
      });

    it('should mark all rows unchanged when no overrides',
      () => {
        const rows = listTranslationRows({messages: MESSAGES});
        for(const row of rows) {
          expect(row.changed).to.be(false);
          expect(row.editedValue).to.be(undefined);
        }
      });

    it('should include override keys not in originals', () => {
      const overrides = {en: {newKey: 'New value'}};
      const rows = listTranslationRows({
        messages: MESSAGES,
        overrides
      });
      const newRow = rows.find(
        r => r.lang === 'en' && r.key === 'newKey'
      );
      expect(newRow).to.be.ok();
      expect(newRow.originalValue).to.be('');
      expect(newRow.currentValue).to.be('New value');
      expect(newRow.changed).to.be(true);
    });

    it('should show changed row when override differs', () => {
      const overrides = {en: {greeting: 'Hi there'}};
      const rows = listTranslationRows({
        messages: MESSAGES,
        overrides
      });
      const row = rows.find(
        r => r.lang === 'en' && r.key === 'greeting'
      );
      expect(row.originalValue).to.be('Hello');
      expect(row.currentValue).to.be('Hi there');
      expect(row.editedValue).to.be('Hi there');
      expect(row.changed).to.be(true);
    });

    it('should not treat override matching original as changed',
      () => {
        const overrides = {en: {greeting: 'Hello'}};
        const rows = listTranslationRows({
          messages: MESSAGES,
          overrides
        });
        const row = rows.find(
          r => r.lang === 'en' && r.key === 'greeting'
        );
        expect(row.changed).to.be(false);
        expect(row.editedValue).to.be('Hello');
        expect(row.currentValue).to.be('Hello');
      });

    it('should return sorted rows by lang then key', () => {
      const msgs = {
        fr: {b: '1', a: '2'},
        en: {z: '3', a: '4'}
      };
      const rows = listTranslationRows({messages: msgs});
      const order = rows.map(r => `${r.lang}.${r.key}`);
      expect(order).to.eql([
        'en.a', 'en.z', 'fr.a', 'fr.b'
      ]);
    });
  });

  describe('filterTranslationRows', () => {
    const rows = listTranslationRows({
      messages: MESSAGES,
      overrides: {en: {greeting: 'Hi'}}
    });

    it('should return all rows with no filter', () => {
      const result = filterTranslationRows({rows});
      expect(result.length).to.be(rows.length);
    });

    it('should filter case-insensitively by key', () => {
      const result = filterTranslationRows({
        rows,
        filter: 'GREET'
      });
      for(const r of result) {
        expect(r.key).to.be('greeting');
      }
      expect(result.length).to.be(2);
    });

    it('should filter by pasted existing value', () => {
      const result = filterTranslationRows({
        rows,
        filter: 'bonjour'
      });
      expect(result.length).to.be(1);
      expect(result[0].lang).to.be('fr');
      expect(result[0].key).to.be('greeting');
    });

    it('should filter by language code', () => {
      const result = filterTranslationRows({
        rows,
        filter: 'fr'
      });
      for(const r of result) {
        expect(r.lang).to.be('fr');
      }
    });

    it('should return only changed rows with changedOnly',
      () => {
        const result = filterTranslationRows({
          rows,
          changedOnly: true
        });
        expect(result.length).to.be(1);
        expect(result[0].lang).to.be('en');
        expect(result[0].key).to.be('greeting');
        expect(result[0].changed).to.be(true);
      });

    it('should combine filter and changedOnly', () => {
      const result = filterTranslationRows({
        rows,
        filter: 'en',
        changedOnly: true
      });
      expect(result.length).to.be(1);
      expect(result[0].key).to.be('greeting');
    });
  });

  describe('getChangedTranslations', () => {
    it('should return only changed keys grouped by lang',
      () => {
        const overrides = {
          en: {greeting: 'Hi'},
          fr: {greeting: 'Bonjour'}
        };
        const result = getChangedTranslations({
          originalMessages: MESSAGES,
          overrides
        });
        expect(result.en).to.be.ok();
        expect(result.en.greeting).to.be('Hi');
        expect(result.fr).to.be(undefined);
      });

    it('should omit empty language groups', () => {
      const overrides = {
        en: {greeting: 'Hello'},
        fr: {farewell: 'Au revoir'}
      };
      const result = getChangedTranslations({
        originalMessages: MESSAGES,
        overrides
      });
      expect(Object.keys(result).length).to.be(0);
    });

    it('should include override keys not in originals', () => {
      const overrides = {en: {extra: 'Bonus'}};
      const result = getChangedTranslations({
        originalMessages: MESSAGES,
        overrides
      });
      expect(result.en.extra).to.be('Bonus');
    });
  });

  describe('serializeTranslationsYaml', () => {
    it('should return empty string for no translations', () => {
      const yaml = serializeTranslationsYaml({
        translations: {}
      });
      expect(yaml).to.be('');
    });

    it('should serialize simple safe strings as plain ' +
      'scalars', () => {
      const yaml = serializeTranslationsYaml({
        translations: {en: {greeting: 'Hello'}}
      });
      expect(yaml).to.contain('greeting: Hello');
    });

    it('should double-quote strings that need quoting', () => {
      const yaml = serializeTranslationsYaml({
        translations: {en: {label: 'value: with colon'}}
      });
      expect(yaml).to.contain(
        'label: "value: with colon"'
      );
    });

    it('should escape backslash and quotes', () => {
      const yaml = serializeTranslationsYaml({
        translations: {en: {msg: 'say "hi" \\ there'}}
      });
      expect(yaml).to.contain(
        'msg: "say \\"hi\\" \\\\ there"'
      );
    });

    it('should use block scalar for multiline values', () => {
      const yaml = serializeTranslationsYaml({
        translations: {en: {body: 'line one\nline two'}}
      });
      expect(yaml).to.contain('body: |');
      expect(yaml).to.contain('    line one');
      expect(yaml).to.contain('    line two');
    });

    it('should sort language codes and keys', () => {
      const yaml = serializeTranslationsYaml({
        translations: {
          fr: {z: 'Z', a: 'A'},
          en: {b: 'B', a: 'A'}
        }
      });
      const lines = yaml.split('\n');
      const langLines = lines.filter(
        l => /^\w+:$/.test(l)
      );
      expect(langLines[0]).to.be('en:');
      expect(langLines[1]).to.be('fr:');
      const enIdx = lines.indexOf('en:');
      expect(lines[enIdx + 1]).to.contain('a:');
      expect(lines[enIdx + 2]).to.contain('b:');
    });

    it('should quote empty strings', () => {
      const yaml = serializeTranslationsYaml({
        translations: {en: {empty: ''}}
      });
      expect(yaml).to.contain('empty: ""');
    });

    it('should quote boolean-like values', () => {
      const yaml = serializeTranslationsYaml({
        translations: {en: {flag: 'true'}}
      });
      expect(yaml).to.contain('flag: "true"');
    });
  });
});
