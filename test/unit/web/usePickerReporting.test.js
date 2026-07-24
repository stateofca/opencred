/*!
 * Copyright 2026 California Department of Motor Vehicles
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as sinon from 'sinon';
import expect from 'expect.js';

import {usePickerReporting} from
  '../../../web/composables/usePickerReporting.js';

// The composable reports interaction-picker funnel events and guards against
// a selection (which also closes the picker) being double-counted as a
// dismissal. It is deliberately decoupled from httpClient/context: callers
// pass a `reportEvent(type, payload)` sink and a `getCurrentMethod()` reader.
function setup({currentMethod = 'dcapi'} = {}) {
  const reportEvent = sinon.spy();
  const getCurrentMethod = () => currentMethod;
  const api = usePickerReporting({reportEvent, getCurrentMethod});
  return {reportEvent, api};
}

describe('usePickerReporting', () => {
  it('reports interaction_picker_opened with the current method on open',
    () => {
      const {reportEvent, api} = setup({currentMethod: 'dcapi'});
      api.onOpen();
      expect(reportEvent.calledOnce).to.be(true);
      const [type, payload] = reportEvent.firstCall.args;
      expect(type).to.equal('interaction_picker_opened');
      expect(payload).to.eql({method: 'dcapi'});
    });

  it('reports interaction_method_selected with from/to on select', () => {
    const {reportEvent, api} = setup({currentMethod: 'dcapi'});
    api.onSelect({method: 'qr-and-link'});
    expect(reportEvent.calledOnce).to.be(true);
    const [type, payload] = reportEvent.firstCall.args;
    expect(type).to.equal('interaction_method_selected');
    expect(payload).to.eql({fromMethod: 'dcapi', toMethod: 'qr-and-link'});
  });

  it('reports interaction_picker_dismissed on a close with no prior select',
    () => {
      const {reportEvent, api} = setup({currentMethod: 'qr-and-link'});
      api.onOpen();
      reportEvent.resetHistory();
      api.onClose();
      expect(reportEvent.calledOnce).to.be(true);
      const [type, payload] = reportEvent.firstCall.args;
      expect(type).to.equal('interaction_picker_dismissed');
      expect(payload).to.eql({method: 'qr-and-link'});
    });

  it('does NOT report a dismissal when the close follows a selection', () => {
    const {reportEvent, api} = setup();
    api.onOpen();
    api.onSelect({method: 'qr-and-link'});
    reportEvent.resetHistory();
    api.onClose();
    expect(reportEvent.called).to.be(false);
  });

  it('re-arms the dismiss guard on each open (select, close, reopen, close)',
    () => {
      const {reportEvent, api} = setup();
      // first cycle: select then close -> no dismiss
      api.onOpen();
      api.onSelect({method: 'qr-and-link'});
      api.onClose();
      // second cycle: open then close with no select -> dismiss
      reportEvent.resetHistory();
      api.onOpen();
      reportEvent.resetHistory();
      api.onClose();
      expect(reportEvent.calledOnce).to.be(true);
      expect(reportEvent.firstCall.args[0])
        .to.equal('interaction_picker_dismissed');
    });
});
