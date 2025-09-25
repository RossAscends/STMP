import { myUUID, isHost } from '../script.js';
import util from './utils.js';
import handleconfig from './handleconfig.js';

const $btn = $('#allowImages');

function applyState(on) {
  $btn.toggleClass('toggleButtonOn', on);
  $btn.attr('aria-pressed', on ? 'true' : 'false');
  $btn.prop('title', on ? 'Disallow Image Embeds in Chat Messages (toggle)' : 'Allow Image Embeds in Chat Messages (toggle)');
}

function syncFromLiveConfig() {
  const on = !!handleconfig?.allowImages?.();
  applyState(on);
}

function sendConfigUpdate(on) {
  const cfg = handleconfig.getLiveConfig && handleconfig.getLiveConfig();
  if (!cfg || !myUUID) return;
  cfg.crowdControl.allowImages = on;
  const msg = { UUID: myUUID, type: 'clientStateChange', value: cfg };
  util.messageServer(msg);
}

$(function () {
  if (!$btn.length) return;
  // Initial sync (in case handleconfig already processed liveConfig)
  syncFromLiveConfig();
  $btn.on('click', function () {
    if (!isHost) return;
    const currentlyOn = $btn.attr('aria-pressed') === 'true';
    const next = !currentlyOn;
    applyState(next); // optimistic UI
    sendConfigUpdate(next);
  });
});

export default { syncFromLiveConfig };