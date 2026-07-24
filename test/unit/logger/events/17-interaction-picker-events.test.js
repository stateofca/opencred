/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import expect from 'expect.js';

import {presentationInteractionMethodSelected} from
  '../../../../lib/logger/events/presentationInteractionMethodSelected.js';
import {presentationInteractionPickerDismissed} from
  '../../../../lib/logger/events/presentationInteractionPickerDismissed.js';
import {presentationInteractionPickerOpened} from
  '../../../../lib/logger/events/presentationInteractionPickerOpened.js';

describe('logger/events interaction-picker builders', () => {
  it('presentationInteractionPickerOpened builds expected payload', () => {
    const {logName, event} = presentationInteractionPickerOpened({
      clientId: 'c1',
      exchangeId: 'e1',
      method: 'dcapi'
    });
    expect(logName).to.equal('presentation_event');
    expect(event).to.eql({
      type: 'presentation_interaction_picker_opened',
      clientId: 'c1',
      exchangeId: 'e1',
      error: undefined,
      method: 'dcapi'
    });
  });

  it('presentationInteractionPickerOpened defaults missing ids to unknown',
    () => {
      const {event} = presentationInteractionPickerOpened({});
      expect(event.clientId).to.equal('unknown');
      expect(event.exchangeId).to.equal('unknown');
    });

  it('presentationInteractionPickerOpened omits method when absent', () => {
    const {event} = presentationInteractionPickerOpened({
      clientId: 'c1',
      exchangeId: 'e1'
    });
    expect(event).not.to.have.key('method');
  });

  it('presentationInteractionMethodSelected builds expected payload', () => {
    const {logName, event} = presentationInteractionMethodSelected({
      clientId: 'c1',
      exchangeId: 'e1',
      fromMethod: 'dcapi',
      toMethod: 'qr-and-link'
    });
    expect(logName).to.equal('presentation_event');
    expect(event).to.eql({
      type: 'presentation_interaction_method_selected',
      clientId: 'c1',
      exchangeId: 'e1',
      error: undefined,
      fromMethod: 'dcapi',
      toMethod: 'qr-and-link'
    });
  });

  it('presentationInteractionMethodSelected defaults missing ids to unknown',
    () => {
      const {event} = presentationInteractionMethodSelected({});
      expect(event.clientId).to.equal('unknown');
      expect(event.exchangeId).to.equal('unknown');
    });

  it('presentationInteractionMethodSelected omits methods when absent', () => {
    const {event} = presentationInteractionMethodSelected({
      clientId: 'c1',
      exchangeId: 'e1'
    });
    expect(event).not.to.have.key('fromMethod');
    expect(event).not.to.have.key('toMethod');
  });

  it('presentationInteractionMethodSelected keeps equal from/to (no switch)',
    () => {
      const {event} = presentationInteractionMethodSelected({
        clientId: 'c1',
        exchangeId: 'e1',
        fromMethod: 'dcapi',
        toMethod: 'dcapi'
      });
      expect(event.fromMethod).to.equal('dcapi');
      expect(event.toMethod).to.equal('dcapi');
    });

  it('presentationInteractionPickerDismissed builds expected payload', () => {
    const {logName, event} = presentationInteractionPickerDismissed({
      clientId: 'c1',
      exchangeId: 'e1',
      method: 'qr-and-link'
    });
    expect(logName).to.equal('presentation_event');
    expect(event).to.eql({
      type: 'presentation_interaction_picker_dismissed',
      clientId: 'c1',
      exchangeId: 'e1',
      error: undefined,
      method: 'qr-and-link'
    });
  });

  it('presentationInteractionPickerDismissed defaults missing ids to unknown',
    () => {
      const {event} = presentationInteractionPickerDismissed({});
      expect(event.clientId).to.equal('unknown');
      expect(event.exchangeId).to.equal('unknown');
    });

  it('presentationInteractionPickerDismissed omits method when absent', () => {
    const {event} = presentationInteractionPickerDismissed({
      clientId: 'c1',
      exchangeId: 'e1'
    });
    expect(event).not.to.have.key('method');
  });
});
