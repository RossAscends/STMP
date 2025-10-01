import util from './utils.js';
import handleconfig from './handleconfig.js';
import { myUUID, isHost } from '../script.js';

// Killswitches map: DOM id -> config key in promptConfig
const KS = {
  toggleSystemPrompt: 'killSystemPrompt',
  toggleD4AN: 'killD4AN',
  toggleD1JB: 'killD1JB',
  toggleD0PH: 'killD0PH',
  toggleResponsePrefill: 'killResponsePrefill'
};

function isDisabled($icon) {
  return $icon.hasClass('insertionPromptDisabled') || $icon.hasClass('fa-toggle-off');
}

function setIconState($icon, disabled) {
  $icon.toggleClass('fa-toggle-on', !disabled);
  $icon.toggleClass('fa-toggle-off', disabled);
  $icon.toggleClass('insertionPromptDisabled', disabled);
}

function readStatesFromDOM() {
  const states = {};
  for (const [iconId, cfgKey] of Object.entries(KS)) {
    const $icon = $(`#${iconId}`);
    if ($icon.length) {
      states[cfgKey] = isDisabled($icon);
    }
  }
  return states;
}

async function sendStateToServer(partial) {
  if (!isHost || !myUUID) return;
  const live = handleconfig.getLiveConfig?.();
  if (!live || !live.promptConfig) return;
  // Apply flags onto the current live config object
  Object.assign(live.promptConfig, partial);
  util.messageServer({ type: 'clientStateChange', UUID: myUUID, value: live });
}

function applyConfigToDOM(liveConfig) {
  const pc = liveConfig?.promptConfig || {};
  const defaults = {
    killSystemPrompt: false,
    killD4AN: false,
    killD1JB: false,
    killD0PH: false,
    killResponsePrefill: false
  };
  const merged = { ...defaults, ...pc };
  for (const [iconId, cfgKey] of Object.entries(KS)) {
    const $icon = $(`#${iconId}`);
      if (!$icon.length) continue;
      console.warn(`applyConfigToDOM: $iconId = ${iconId}`);
    setIconState($icon, !!merged[cfgKey]);
  }
}

function bindListeners() {
  if (!isHost) return; // Only host can toggle and persist
  Object.keys(KS).forEach(iconId => {
    const $icon = $(`#${iconId}`);
    if (!$icon.length) return;
    $icon.off('click').on('click', () => {
      const nextDisabled = !isDisabled($icon);
      setIconState($icon, nextDisabled);
      const cfgKey = KS[iconId];
      const payload = { [cfgKey]: nextDisabled };
      sendStateToServer(payload);
    });
  });
}

export default { applyConfigToDOM, bindListeners, readStatesFromDOM };
