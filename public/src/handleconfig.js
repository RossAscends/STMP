/* Handles everything related to the control panel.
Based on the following array sent from server:

  liveConfig = [
      promptConfig: {
          selectedCharacter,         //selector value, matches an item from the cardList below
          cardList: {                //selector value array list
              {value: './filepath/', name: 'string'},
          },                
          selectedPreset,         // selector value
          presetList: {           //selector value array list
              {value: './filepath/',name:'string'},
          }
          instructFormat,          //selector value
          instructList: {          //selector value array list
              {value: './filepath/',name:'string'},
          }
          responseLength,         //selector value
          contextSize,            //selector value
          isStreaming,            //checkbox
          systemPrompt,           //text field value
          D4AN,                   //text field value
          D4CharDefs,             //checkbox boolean
          D1JB,                   //text field value
          APIList: {
              name,
              endpoint,
              key,
              type,
              claude,
              value              //this is a copy of 'name' for selector population purposes
            },
          selectedAPI,          //just the name
          isAutoResponse,     //boolean for checkbox
      },
      APIConfig: {
              name,               //string
              endpoint,           //string
              key,                //string
              type,               //selector value,
              claude,             //checkbox
              selectedModel,      //selector value, matches an item from the modelList below
              modelList: {}       //list for a selector
          },
      },
      crowdControl: {
          userChatDelay,      //number input value
          AIChatDelay,           //number input value
          allowImages,        //checkbox
          guestInputPermissionState, //boolean to toggle body class
      },
  ]
*/

//possible unique mesage types per setting
/*
const messageTypes = {
  // promptConfig
  UPDATE_SELECTED_CHARACTER: 'updateSelectedCharacter',
  UPDATE_CARD_LIST: 'updateCardList',
  UPDATE_SELECTED_PRESET: 'updateSelectedPreset',
  UPDATE_PRESET_LIST: 'updatePresetList',
  UPDATE_INSTRUCT_FORMAT: 'updateInstructFormat',
  UPDATE_INSTRUCT_LIST: 'updateInstructList',
  UPDATE_RESPONSE_LENGTH: 'updateResponseLength',
  UPDATE_CONTEXT_SIZE: 'updateContextSize',
  UPDATE_IS_STREAMING: 'updateIsStreaming',
  UPDATE_SYSTEM_PROMPT: 'updateSystemPrompt',
  UPDATE_D4AN: 'updateD4AN',
  UPDATE_D4_CHAR_DEFS: 'updateD4CharDefs',
  UPDATE_D1JB: 'updateD1JB',
  UPDATE_API: 'updateAPI', // Single API update/addition
  DELETE_API: 'deleteAPI', // API deletion
  UPDATE_SELECTED_API: 'updateSelectedAPI',
  UPDATE_IS_AUTO_RESPONSE: 'updateIsAutoResponse',
  // APIConfig
  UPDATE_API_CONFIG: 'updateAPIConfig',
  // crowdControl
  UPDATE_USER_CHAT_DELAY: 'updateUserChatDelay',
  UPDATE_AI_CHAT_DELAY: 'updateAIChatDelay',
  UPDATE_ALLOW_IMAGES: 'updateAllowImages'
};*/

import util from "./utils.js";
import control from "./controls.js";
import { myUUID, callCharDefPopup } from "../script.js";
import { getMuteButtonForIndex, applyMuteButtonStates, bindMuteButtonEvents, ensureMuteButtonInitialState, isMutedButton } from './muteCharButtons.js';

var APIConfig, liveAPI, promptConfig, crowdControl, selectedModelForGuestDisplay
var initialLoad = true

export var liveConfig

async function processLiveConfig(configArray) {

  if (configArray.liveConfig) {
    liveConfig = configArray.liveConfig;  //for the first time reception
  } else {
    liveConfig = configArray.value //for everytime after that.
  }
  // Process promptConfig
  const {
    selectedCharacter, cardList,
    selectedInstruct, instructList,
    selectedSamplerPreset, samplerPresetList,
    APIList, selectedAPI,
    responseLength, contextSize, isStreaming, isAutoResponse, engineMode,
    systemPrompt, D4AN, D4CharDefs, D1JB,
  } = liveConfig.promptConfig

  //Process APIConfig
  liveAPI = liveConfig.promptConfig.APIList.find(api => api.name === selectedAPI)
  APIConfig = liveConfig.APIConfig
  promptConfig = liveConfig.promptConfig
  crowdControl = liveConfig.crowdControl

  //console.log(liveAPI)
  //console.log(APIConfig)
  //console.log(promptConfig)
  //console.log(crowdControl)

  const { userChatDelay, AIChatDelay, allowImages } = liveConfig.crowdControl;
  selectedModelForGuestDisplay = liveConfig.APIConfig.selectedModel || liveConfig.selectedModelForGuestDisplay


  await setEngineMode(engineMode);
  // Multi-character population (overrides legacy single-character selectors)
  if (!promptConfig.selectedCharacters || !Array.isArray(promptConfig.selectedCharacters)) {
    promptConfig.selectedCharacters = [];
    if (selectedCharacter) {
      promptConfig.selectedCharacters.push({ value: selectedCharacter, displayName: liveConfig.promptConfig.selectedCharacterDisplayName || selectedCharacter, isMuted: false });
    }
  }
  // --- Dynamic multi-character slot reconstruction on load/refresh ---
  // Ensure the number of visible selector slots matches the length of promptConfig.selectedCharacters.
  // (Previously only the first slot would render after a hard refresh, causing UI/server desync.)
  try {
    let desiredCount = promptConfig.selectedCharacters.length;
    if (desiredCount === 0) {
      // Always keep at least one slot present in the UI.
      promptConfig.selectedCharacters = [{ value: 'None', displayName: '[None]', isMuted: false }];
      desiredCount = 1;
    }
    let $currentSelectors = $("[id^='cardList']");
    const existingCount = $currentSelectors.length;

    // Add missing slots without triggering rebuildSelectedCharactersFromUI (to preserve server state)
    if (desiredCount > existingCount) {
      for (let i = existingCount; i < desiredCount; i++) {
        addCharacterSlot(true); // skipRebuild=true
      }
    } else if (desiredCount < existingCount) {
      // Remove extra trailing slots (never remove the base first slot)
      for (let j = existingCount; j > desiredCount; j--) {
        const id = j === 1 ? 'cardList' : `cardList${j}`; // j is 1-based relative to count when looping downward
        if (id === 'cardList') break; // keep base
        const $sel = $(`#${id}`);
        if ($sel.length) {
          const $wrap = $sel.closest('.custom-select');
            $wrap.remove();
        }
      }
    }
    // Refresh selector cache after possible DOM mutations
    $currentSelectors = $("[id^='cardList']");
    // Re-bind events for any new slots
    bindDynamicCharacterEvents();
  } catch (e) {
    console.warn('Character slot reconstruction error:', e);
  }
  // --- End reconstruction block ---
  const baseList = Array.isArray(cardList) ? cardList : [];
  const masterCardList = [{ name: '[None]', value: 'None' }, ...baseList];
  const $charSelectors = $("[id^='cardList']");
  const populatePromises = [];
  $charSelectors.each(function (idx) {
    const selID = this.id;
    const entry = promptConfig.selectedCharacters[idx];
    const valueToSet = entry ? entry.value : 'None';
    populatePromises.push(populateSelector(masterCardList, selID, valueToSet));
  });
  // Wait until all selectors populated before adjusting buttons
  await Promise.all(populatePromises);
  enforceUniqueCharacterOptions();
  applyMuteButtonStates(liveConfig);
  updateAllSlotActionButtons();
  await populateSelector(APIList, "APIList", selectedAPI);
  await populateSelector(samplerPresetList, "samplerPresetList", selectedSamplerPreset);
  await populateSelector(instructList, "instructList", selectedInstruct);

  await populateInput(selectedAPI, "selectedAPI");

  await selectFromPopulatedSelector(responseLength, "responseLength");
  await selectFromPopulatedSelector(contextSize, "contextSize");
  await toggleCheckbox(isAutoResponse, "isAutoResponse");
  await toggleCheckbox(isStreaming, "isStreaming");

  await populateInput(liveAPI.endpoint, "endpoint");
  await populateInput(liveAPI.key, "key");
  await selectFromPopulatedSelector(liveAPI.type, "type");
  await toggleCheckbox(liveAPI.claude, "claude");

  await populateInput(systemPrompt, "systemPrompt");
  await populateInput(D4AN, "D4AN");
  await toggleCheckbox(D4CharDefs, "D4CharDefs");
  await populateInput(D1JB, "D1JB");

  await populateInput(userChatDelay, "userChatDelay");
  await populateInput(AIChatDelay, "AIChatDelay");
  // allowImages now a button toggle (not checkbox)
  setButtonToggleState('#allowImages', allowImages);


  if (!APIConfig.modelList) {
    console.warn('Did not see a modelList for this API, clicking modelListButton to get one.')
    $("#modelListRefreshButton").trigger("click");
  } else { //problem: APIConfig.modeList will save the modelList from non-horde APIs, even if horde is the active engine mode
    //this is because EngineMode is part of promptConfig, not APIConfig
    //however APIConfig.SelectedModel DOES save the last selected horde model...so we can use that..

    //so here we prime the horde model list if it's selected, hoping that selectedModel exists within it still..
    if (engineMode === 'horde' && $("#hordeWorkerList option").length === 0) {
      console.warn('populating empty horde model list')
      await control.getModelList()
      console.warn(`selecting ${APIConfig.selectedModel} from horde model list which is no longer empty`)
      await util.delay(250)
      await selectFromPopulatedSelector(APIConfig.selectedModel, "hordeWorkerList")
      $("#charName").parent().prop('title', `Powered by  ${APIConfig.selectedModel}`);
      //console.log('clicking horde model button load')
      //$("#modelListRefreshButton").trigger("click");
    } else {

      await populateSelector(APIConfig.modelList, "modelList", APIConfig.selectedModel);
    }
  }



  initialLoad = false
}

/**
 * Populates a selector element with options based on a list of items.
 *
 * @param {Array} itemsObj - an array of items with 'value' and 'name' properties.
 * @param {string} elementID - The ID of the selector element.
 * @param {string} selectedValue - Optional. The value to select after the population is finished.
 * @returns {Promise} - A Promise that resolves once the selector element is populated and optionally selected.
 */
async function populateSelector(itemsObj, elementID, selectedValue = null) {
  return new Promise(async (resolve) => {
    // Skip validation for itemsObj since it's an array, not a single value
    if (!itemsObj || !Array.isArray(itemsObj)) {
      console.warn(`Error: Invalid itemsObj for ${elementID}`, itemsObj);
      await util.flashElement(elementID, 'bad');
      resolve();
      return;
    }

    //console.debug(`Populating selector ${elementID}`);
    const selectElement = $(`#${elementID}`);

    // Capture current value to preserve selection
    const currentValue = selectElement.val();

    // Clear and repopulate selector
    selectElement.empty();
    if (elementID === 'APIList') {
      selectElement.append($('<option>').val('addNewAPI').text('Add New API'));
    }
    if (elementID === 'hordeWorkerList') {
      selectElement.append($('<option>').val('NULL').text('Select a Horde model..'));
    }

    itemsObj.forEach((item) => {
      const newElem = $("<option>");
      newElem.val(item.value || item.name || item);
      newElem.text(item.name || item);
      selectElement.append(newElem);
    });

    // Restore previous selection if it exists in the new options
    if (currentValue && selectElement.find(`option[value="${currentValue}"]`).length) {
      selectElement.val(currentValue);
    }

    // Set the selected value if provided
    if (selectedValue) {
      await selectFromPopulatedSelector(selectedValue, elementID);
    }

    resolve();
  });
}

/**
 * Selects a value in a populated selector element.
 *
 * @param {string} value - The value to select.
 * @param {string} elementID - The ID of the selector element.
 * @returns {Promise} - A Promise that resolves once the value is selected.
 */
async function selectFromPopulatedSelector(value, elementID) {
  return new Promise(async (resolve) => {
    const shouldContinue = await checkArguments("selectFromPopulatedSelector", [value, elementID], true);
    if (!shouldContinue) {
      resolve();
      return;
    }

    const selectElement = $(`#${elementID}`);
    selectElement.val(value); // Set the value directly
    util.flashElement(elementID, "good");
    //console.debug(`Set ${elementID} to ${value}, current value is ${selectElement.val()}`);
    resolve();
  });
}

async function populateInput(value, elementID) {
  return new Promise(async (resolve) => {
    //console.warn('populateInput checking:', value, elementID)
    let shouldContinue = await checkArguments("populateInput", arguments)
    if (!shouldContinue) {
      resolve();
      return
    }
    //console.warn('populating input:', value, elementID)
    $(`#${elementID}`).val(value);
    util.flashElement(elementID, "good");
    //console.debug(`confirming ${elementID} value is now ${$(`#${elementID}`).val()}`);
    resolve();
  })
}

async function toggleCheckbox(value, elementID) {
  //console.debug(`${elementID} previous state:`, $(`#${elementID}`).prop("checked"));
  //console.debug(elementID, ' incoming value:', value);

  if (Number.isInteger(value)) {
    //console.debug('Received integer for checkbox value:', elementID, value);
  }

  return new Promise(async (resolve) => {
    const shouldContinue = await checkArguments("toggleCheckbox", arguments);
    if (!shouldContinue) {
      //console.debug(elementID, ' saw no need to change, early stop')
      resolve();
      return;
    }

    //console.debug(elementID, '- setting checkbox checked state: ', value);
    $(`#${elementID}`).prop("checked", Boolean(value));
    console.debug(`${elementID} checked state after change:`, $(`#${elementID}`).prop("checked"));

    util.flashElement(elementID, "good");
    resolve();
  });
}


/**
 * Validates arguments for DOM manipulation functions.
 *
 * @param {string} functionName - The name of the calling function.
 * @param {Array} args - The arguments passed to the function.
 * @param {boolean} isSelectorCheck - Whether to verify option existence for select elements.
 * @returns {Promise<boolean>} - True if arguments are valid and update is needed, false otherwise.
 */
async function checkArguments(functionName, args, isSelectorCheck = false) {
  const [value, elementID, selectedValue] = args;

  if (value === null || value === undefined) {
    console.warn(`Error: Invalid value for ${functionName}!`, value, elementID, selectedValue);
    await util.flashElement(elementID, 'bad');
    return false;
  }

  if (elementID === null || elementID === undefined) {
    console.warn(`Error: Invalid elementID for ${functionName}!`, value, elementID, selectedValue);
    await util.flashElement('AIConfigWrap', 'bad');
    return false;
  }

  const elementExists = await verifyElementExists(elementID);
  if (!elementExists) {
    await util.flashElement('AIConfigWrap', 'bad');
    return false;
  }

  if (isSelectorCheck) {
    const optionExists = await verifyOptionExists(value, elementID);
    if (!optionExists) {
      await util.flashElement(elementID, 'bad');
      return false;
    }
  }

  const areValuesTheSame = await verifyValuesAreTheSame(value, elementID);
  if (areValuesTheSame) {
    //console.debug(`No update needed for ${elementID}: values are the same`);
    return false;
  }

  return true;
}

async function verifyElementExists(elementID) {
  const $element = $(`#${elementID}`);
  if (!$element.length) {
    console.warn("ERROR: Could not find element called:", elementID);
    await util.flashElement("AIConfigWrap", "bad");
    return false;
  }
  return true;
}

async function verifyOptionExists(optionValue, elementID) {
  const $element = $(`#${elementID}`);

  const options = $element.find("option");
  const optionExists = options.toArray().some((option) => option.value === optionValue);

  if (!optionExists) {
    console.warn(`ERROR: Option with value ${optionValue} didn't exist in ${elementID}!`);
    await util.flashElement(elementID, "bad");
    return false;
  }
  return true;
}

/**
 * Verifies if the current value of an element matches the provided value.
 *
 * @param {any} value - The value to compare.
 * @param {string} elementID - The ID of the element.
 * @returns {Promise<boolean>} - True if values are the same, false otherwise.
 */
async function verifyValuesAreTheSame(value, elementID) {
  const $element = $(`#${elementID}`);
  let elementValue;

  if ($element.is(':checkbox')) {
    elementValue = Boolean($element.prop('checked'));
    value = value === 'true' || value === true || value === 1; // Normalize to boolean
  } else if ($element.is('select')) {
    //console.debug('saw selector comparison for:', elementID);
    elementValue = String($element.val() || ''); // Use .val() for select, normalize to string
    value = String(value || '');
  } else {
    elementValue = String($element.val() || '');
    value = String(value || '');
  }

  //console.debug(`verifyValuesAreTheSame: ${elementID} | new: ${value} (${typeof value}) | current: ${elementValue} (${typeof elementValue})`);

  const result = elementValue === value;
  if (!result) {
    /*     console.debug(`Compared values for ${elementID}:
        New ${value}
        Current ${elementValue}
        Needs update!`); */
  }
  return result;
}

// set the engine mode to either horde or Text Completions based on a value from the websocket
async function setEngineMode(mode, hordeWorkerList = null) {
  // Check if the mode has changed
  let shouldModify = true
  const toggleModeElement = $("#toggleMode");
  const isHordeMode = mode === "horde";

  /*   if (liveConfig.promptConfig.engineMode === mode) {
      shouldModify = false
      console.debug(`No change in engineMode: ${mode}, skipping update`);
    } */

  if (shouldModify) {
    console.debug("API MODE:", mode);
    liveConfig.promptConfig.engineMode = mode;

    toggleModeElement
      .toggleClass("TCMode", !isHordeMode)
      .toggleClass("hordeMode", isHordeMode)
      .text(isHordeMode ? "🧟" : "📑")
      .attr("title", isHordeMode ? "Click to switch to Text Completions Mode" : "Click to switch to Horde Mode");

    console.log(`Switching to ${isHordeMode ? "Horde" : "Text Completions"} Mode`);

    util.flashElement("toggleMode", "good");
  }
  if (isHordeMode) {
    $("#TCCCAPIBlock").hide();
    $("#isStreaming").prop('checked', false);
    $("#isStreamingChekboxBlock").hide();
    populateSelector(hordeWorkerList, 'hordeWorkerList');
    $("#hordeWorkerListBlock").show();
  } else {
    $("#hordeWorkerListBlock").hide();
    $("#TCCCAPIBlock").show();
    $("#isStreaming").prop('checked', isStreaming);
    console.debug('hiding horde model list');
    $("#isStreamingChekboxBlock").show();
  }
}

function deleteAPI() {
  let APIToDelete = $("#APIList").children('option:selected').val();

  if (APIToDelete === 'Default' || APIToDelete === 'Add New API') {
    alert(`Cannot delete required options in this selector ('Default' and 'Add New API'!`)
    return
  }

  console.log(APIToDelete)
  let indexToDelete = liveConfig.promptConfig.APIList.findIndex(function (item) {
    return item.name === APIToDelete;
  });

  if (indexToDelete !== -1) {
    liveConfig.promptConfig.APIList.splice(indexToDelete, 1);
    liveConfig.promptConfig.selectedAPI = 'Default'
  }

  console.log(liveConfig.promptConfig.APIList)
  console.log(liveConfig.promptConfig.selectedAPI)

  $("#APIList").children('option[value="Default"]').prop('selected', true);
  updateConfigState($("#APIList"))
  util.betterSlideToggle($("#promptConfig"), 250, "height");
  util.betterSlideToggle($("#APIConfig"), 250, "height");
}

//MARK: updateConfigState
async function updateConfigState(element) {
  console.warn('updateConfigState', element.prop('id'))
  //console.debug('LOCAL ENGINE MODE = ', liveConfig.promptConfig.engineMode)
  if (initialLoad) { return }

  let $element = element
  let elementID = $element.prop('id')

  let arrayName, propName, value

  if ($element.is('input[type=checkbox]')) {
    value = $element.prop('checked')
    if (value === 0) {
      console.warn('saw integer for checkbox value for', elementID, value)
      value = false
    }
    if (value === 1) {
      console.warn('saw integer for checkbox value for', elementID, value)
      value = true
    }
  }
  else { // selectors and text inputs
    value = $element.val()
  }

  if (/^cardList\d*$/.test(elementID)) {
    arrayName = 'promptConfig'
    propName = 'selectedCharacter'
    liveConfig['promptConfig'][elementID] = getCardListArrayFromSelectorContents(elementID)
    liveConfig['promptConfig']['selectedCharacterDisplayName'] = $element.find('option:selected').text()
  }
  else if ($element.is('select') && $element.hasClass('dynamicSelector')) {
    //console.log('dynamic selector')
    arrayName = elementID.replace('List', '');
    let arrayNameForParse = arrayName.charAt(0).toUpperCase() + arrayName.slice(1);
    arrayName = $element.closest('.isArrayType').prop('id') //this will resolve to either promptConfig or APIConfig, whichever the input element is inside of.
    propName = 'selected' + arrayNameForParse
    //ex: selector element "#modelList" existing inside the #promptConfig div
    //result: the selector's value is applied to "liveConfig.promptConfig.selectedModel"

  }
  else {
    //console.log('static selector, text field, or checkbox')
    propName = elementID
    arrayName = $element.closest('.isArrayType').prop('id')
    //console.warn('arrayName:', arrayName)
    if (arrayName == undefined) {
      if ($element.data('for-config-array') !== undefined) {
        arrayName = $element.data('for-config-array')
        console.warn('arrayName was undefined, but element has data-for-config-array:', arrayName)
      } else {
        arrayName = 'promptConfig'
      }
    }
  }

  console.debug(`${arrayName}.${propName}: "${value}"`)

  liveConfig[arrayName][propName] = value

  let stateChangeMessage = {
    UUID: myUUID,
    type: 'clientStateChange',
    value: liveConfig
  }

  await util.flashElement(elementID, 'good')
  util.messageServer(stateChangeMessage)
}

const $cardList = $("#cardList");
async function refreshCardList(cardList) {
  //console.warn('old cardList', liveConfig.promptConfig.cardList)
  //do a for loop for each dom element that has 'cardlist' as the ID prefix
  //first find all elements with id starting with 'cardList'
  let numLists = $("[id^='cardList']").length
  console.warn('saw', numLists, 'cardList selectors to refresh')
  const master = [{ name: '[None]', value: 'None' }, ...(cardList || [])];
  for (let i = 0; i < numLists; i++) {
    const whichList = i === 0 ? 'cardList' : `cardList${i + 1}`;
    const existing = liveConfig.promptConfig.selectedCharacters?.[i];
    const val = existing ? existing.value : 'None';
    await populateSelector(master, whichList, val);
  }
  enforceUniqueCharacterOptions();
  rebuildSelectedCharactersFromUI();
}

function getCardListArrayFromSelectorContents(whichCardList = 'cardList') {
  const cardListObj = [];
  let i = 0;
  $(`#${whichCardList} option`).each(function () {
    const optionValue = $(this).val();
    const optionText = $(this).text();
    cardListObj[i] = { name: optionText, value: optionValue };
    i++;
  });
  return cardListObj;
}


$("#APIList").on("change", async function () {
  if ($(this).val() === "Default") {
    return;
  }

  //console.debug("[#apilist] changed");
  if ($(this).val() === "addNewAPI") {
    //console.debug('[#apilist]...to "addNewApi"');
    //clear all inputs for API editing
    $("#APIConfig input").val("");
    control.enableAPIEdit();
    //hide API config, show API edit panel.
    util.betterSlideToggle($("#promptConfig"), 250, "height");
    util.betterSlideToggle($("#APIConfig"), 250, "height");
    return;
  } else {
    //console.debug(`[#apilist]...to "${$(this).val()}"`);
    if ($("#APIConfig").css("display") !== "none") {
      util.betterSlideToggle($("#APIConfig"), 250, "height");
      control.hideAddNewAPIDiv();
    }
    if ($("#promptConfig").css("display") === "none") {
      util.betterSlideToggle($("#promptConfig"), 250, "height");
    }
  }
  liveConfig['promptConfig']['selectedAPI'] = $(this).val()
  let selectedAPI = liveConfig.promptConfig.selectedAPI
  liveConfig['APIConfig'] = liveConfig.promptConfig.APIList.find(api => api.name === selectedAPI)
  console.log(liveConfig.APIConfig)

  let stateChangeMessage = {
    UUID: myUUID,
    type: 'clientStateChange',
    value: liveConfig
  } 

  util.messageServer(stateChangeMessage);
  util.flashElement("apiList", "good");
});

$("#promptConfig input, #promptConfig select:not(#APIList, #modelList), [id^='cardList'], #hordeWorkerList").on('change', function () {
  updateConfigState($(this))
})

$("#systemPrompt, #D4AN, #D4CharDefs, #D1JB, #crowdControl input, #AIChatHostControls input, #userChatHostControls input").on('change', function () {
  updateConfigState($(this))
})

// allowImages toggle now handled in standalone module (allowImages.js) similar to disableGuestInput.

// ================= Multi-Character Additions (helpers) =================
function rebuildSelectedCharactersFromUI() {
  const arr = [];
  const $selectors = $("[id^='cardList']");
  $selectors.each(function (idx) {
    const val = $(this).val();
    const text = $(this).find('option:selected').text();
    const muted = isMutedButton(getMuteButtonForIndex(idx));
    if (!val || val === 'None') {
      arr.push({ value: 'None', displayName: '[None]', isMuted: false });
    } else {
      arr.push({ value: val, displayName: text, isMuted: muted });
    }
  });
  if (!liveConfig.promptConfig) liveConfig.promptConfig = {};
  liveConfig.promptConfig.selectedCharacters = arr;
  const firstActive = arr.find(c => c.value !== 'None' && !c.isMuted) || arr.find(c => c.value !== 'None');
  if (firstActive) {
    liveConfig.promptConfig.selectedCharacter = firstActive.value;
    liveConfig.promptConfig.selectedCharacterDisplayName = firstActive.displayName;
  }
  sendConfigStateUpdate('cardList');
}

function setButtonToggleState(selector, isOn) {
  const $btn = $(selector);
  if (!$btn.length) return;
  $btn.toggleClass('toggleButtonOn', !!isOn);
  $btn.attr('aria-pressed', !!isOn);
}

// (mute button helpers moved to muteCharButtons.js)

function sendConfigStateUpdate(elementID) {
  let stateChangeMessage = {
    UUID: myUUID,
    type: 'clientStateChange',
    value: liveConfig
  }
  util.messageServer(stateChangeMessage);
  util.flashElement(elementID, 'good');
}

function enforceUniqueCharacterOptions() {
  const chosen = new Set();
  const $selectors = $("[id^='cardList']");
  $selectors.each(function () {
    const v = $(this).val();
    if (v && v !== 'None') chosen.add(v);
  });
  $selectors.each(function () {
    const selfVal = $(this).val();
    $(this).find('option').each(function () {
      const optVal = $(this).val();
      if (optVal === 'None' || optVal === selfVal) { $(this).prop('disabled', false).show(); return; }
      if (chosen.has(optVal)) {
        $(this).prop('disabled', true).hide();
      } else {
        $(this).prop('disabled', false).show();
      }
    });
  });
}

function bindDynamicCharacterEvents() {
  $("[id^='cardList']").off('change.multiChar').on('change.multiChar', function () {
    const $sel = $(this);
    const val = $sel.val();
    const isBase = this.id === 'cardList';
    // If non-base selector changed to None -> remove its whole slot
    if (val === 'None' && !isBase) {
      const $slot = $sel.closest('.custom-select');
      if ($slot.length) {
        $slot.remove();
        // Re-index remaining dynamic slots to keep IDs compact & event assumptions intact
        reindexCharacterSlots();
      }
    } else {
      // Toggle action buttons visibility for this slot
      toggleSlotActionButtons($sel);
    }
    enforceUniqueCharacterOptions();
    rebuildSelectedCharactersFromUI();
  });
  // Re-bind mute button events via extracted module
  bindMuteButtonEvents(rebuildSelectedCharactersFromUI);
  $("[id^='forceCharReply']").off('click.multiChar').on('click.multiChar', function () {
    const idx = $("[id^='forceCharReply']").index(this);
    const sel = liveConfig?.promptConfig?.selectedCharacters?.[idx];
    if (!sel || sel.value === 'None') return;
    const username = $('#usernameInput').val() || $('#AIUsernameInput').val() || null;
    util.messageServer({
      type: 'requestAIResponse',
      trigger: 'force',
      UUID: myUUID,
      character: { value: sel.value, displayName: sel.displayName },
      username
    });
  });
  $("[id^='charDefsPopupButton']").off('click.multiChar').on('click.multiChar', async function () {
    const idx = $("[id^='charDefsPopupButton']").index(this);
    const sel = liveConfig?.promptConfig?.selectedCharacters?.[idx];
    if (!sel || sel.value === 'None') return;
    if (typeof callCharDefPopup === 'function') {
      callCharDefPopup(sel.value);
    } else {
      util.messageServer({ type: 'displayCharDefs', value: sel.value, UUID: myUUID });
    }
  });
}

function addCharacterSlot(skipRebuild = false) {
  const base = $('#cardList').closest('.custom-select').first();
  if (!base.length) return;
  const count = $("[id^='cardList']").length;
  const nextIndex = count + 1;
  const clone = base.clone(true, true);
  // Update IDs
  clone.find('#charDefsPopupButton').attr('id', `charDefsPopupButton${nextIndex}`);
  clone.find('#cardList').attr('id', `cardList${nextIndex}`).val('None');
  clone.find('#forceCharReply').attr('id', `forceCharReply${nextIndex}`);
  const $newMute = clone.find('#muteChar').attr('id', `muteChar${nextIndex}`).removeClass('greyscale');
  ensureMuteButtonInitialState($newMute);
  // Insert before the Add button container
  $('#addCharacterSlot').parent().before(clone);
  // Ensure newly added slot starts with hidden action buttons (since value is None)
  toggleSlotActionButtons(clone.find('#cardList'));
  updateAllSlotActionButtons();
  bindDynamicCharacterEvents();
  bindMuteButtonEvents(rebuildSelectedCharactersFromUI);
  enforceUniqueCharacterOptions();
  if (!skipRebuild) {
    rebuildSelectedCharactersFromUI();
  }
}

// Hide/show the three action buttons inside the same slot depending on value
function toggleSlotActionButtons($selector) {
  if (!$selector || !$selector.length) return;
  const val = $selector.val();
  const $slot = $selector.closest('.custom-select');
  if (!$slot.length) return;
  const hide = (val === 'None');
  const $buttons = $slot.find('.charSlotActionButton');
  if (hide) {
    $buttons.addClass('isHiddenForNone');
  } else {
    $buttons.removeClass('isHiddenForNone');
  }
}

function updateAllSlotActionButtons() {
  $("[id^='cardList']").each(function(){
    toggleSlotActionButtons($(this));
  });
}

// Re-index dynamic character slots after a removal so indices stay contiguous
function reindexCharacterSlots() {
  const $slots = $('#addCharacterSlot').parent().parent().find('.custom-select');
  // First slot keeps base IDs
  $slots.each(function (i) {
    const $slot = $(this);
    const isBase = (i === 0);
    const $sel = $slot.find('[id^="cardList"]');
    const $defs = $slot.find('[id^="charDefsPopupButton"]');
    const $force = $slot.find('[id^="forceCharReply"]');
    const $mute = $slot.find('[id^="muteChar"]');
    if (isBase) {
      $sel.attr('id', 'cardList');
      $defs.attr('id', 'charDefsPopupButton');
      $force.attr('id', 'forceCharReply');
      $mute.attr('id', 'muteChar');
    } else {
      const idx = i + 1; // 2nd slot -> index 2 etc
      $sel.attr('id', `cardList${idx}`);
      $defs.attr('id', `charDefsPopupButton${idx}`);
      $force.attr('id', `forceCharReply${idx}`);
      $mute.attr('id', `muteChar${idx}`);
    }
    toggleSlotActionButtons($sel);
  });
  bindDynamicCharacterEvents();
}

$(document).ready(function () {
  bindDynamicCharacterEvents();
  $('#addCharacterSlot').off('click.multiAdd').on('click.multiAdd', function () { addCharacterSlot(); });
});

$(".numbersOnlyTextInput").on("input", function () {
  const original = $(this).val();
  let cleaned = original.replace(/[^0-9]/g, "").replace(/^0+/, "") || "0";

  if (original !== cleaned) {
    $(this).val(cleaned);
    setTimeout(() => {
      console.warn('applying focus test 2')
      this.setSelectionRange(0, 1);
    }, 1);
    util.flashElement($(this).prop("id"), "bad");
  }

  if (cleaned < 0 || cleaned > 999) {

    cleaned = util.minMax(cleaned, 0, 999);
    $(this).val(cleaned);
    console.warn("out of range, setting to:", cleaned);
    util.flashElement($(this).prop("id"), "bad");

  }
});

$(".numbersOnlyTextInput").on("keydown", function (e) {
  const val = $(this).val();

  // If input is "0" and user types a digit (0-9), replace it immediately
  if (val === "0") {
    $(this).trigger("focus"); // focus it so selection shows afterwards
    setTimeout(() => {
      this.setSelectionRange(0, 1); //select the zero
    }, 1);
  }

  if (val === "0" && e.key.length === 1 && /[0-9]/.test(e.key)) {
    e.preventDefault();
    $(this).val(e.key).trigger("input").trigger("change");
    return; // stop further processing
  }

  const step = 1;
  const min = parseInt($(this).attr("min")) || 0;
  const max = parseInt($(this).attr("max")) || 999;
  let value = parseInt(val);

  if (isNaN(value)) value = min;

  if (e.key === "ArrowUp") {
    e.preventDefault();
    const newVal = Math.min(value + step, max);
    $(this).val(String(newVal)).trigger("input").trigger("change");
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    const newVal = Math.max(value - step, min);
    if (newVal === "0") {
      $(this).trigger("focus");
      setTimeout(() => {
        console.warn('applying focus test 2')
        this.setSelectionRange(0, 1);
      }, 1);
    }

    $(this).val(String(newVal)).trigger("input").trigger("change");
  }
});

async function addNewAPI() {
  //check each field for validity, flashElement if invalid
  console.debug('[addNewAPI()] >> GO')
  let name = $("#selectedAPI").val()
  let endpoint = $("#endpoint").val()
  let key = $("#key").val()
  let type = $("#type").val()
  let claude = $("#claude").prop('checked')

  if (name === '' || name === 'Default' || name === 'Add New API') {
    await util.flashElement('selectedAPI', 'bad')
    alert(`This name is reserved by system.`)
    return
  }

  if (endpoint.includes('localhost:')) {
    await util.flashElement('endpoint', 'bad')
    alert('For local connections use 127.0.0.1, not localhost')
    return
  }

  if (endpoint === '' || !util.isValidURL(endpoint)) {
    await util.flashElement('endpoint', 'bad')
    alert(`Invalid URL structure.`)
    return
  }

  let newAPI = {
    name: name,
    endpoint: endpoint,
    key: key,
    type: type,
    claude: claude,
  }

  let matchingAPI = liveConfig.promptConfig.APIList.findIndex(obj => obj.name === newAPI.name);

  if (matchingAPI !== -1) {
    // Replace the object at the found index with newAPI
    liveConfig.promptConfig.APIList[matchingAPI] = newAPI;
  } else {
    // Add newAPI to the array
    liveConfig.promptConfig.APIList.push(newAPI);
  }

  liveConfig.promptConfig.selectedAPI = name
  liveConfig.APIConfig = newAPI
  liveAPI = newAPI
  APIConfig = newAPI

  console.debug(APIConfig)
  console.debug(liveAPI)
  //console.debug(liveConfig.promptConfig.APIList)

  console.log('added new API to local liveConfig. Sending to server.')
  let newAPIMessage = {
    UUID: myUUID,
    type: 'clientStateChange',
    value: liveConfig
  }

  util.messageServer(newAPIMessage)

  await util.delay(250)
  //hide edit panel after save is done
  util.betterSlideToggle($("#APIConfig"), 250, 'height')
  util.betterSlideToggle($("#promptConfig"), 250, "height");
  control.disableAPIEdit()

}

export default {
  processLiveConfig,
  updateConfigState,
  refreshCardList,
  // Direct liveConfig reference is a snapshot; use getLiveConfig() for current object
  getLiveConfig: () => liveConfig,
  populateSelector,
  setEngineMode,
  addNewAPI,
  deleteAPI,
  allowImages: () => liveConfig?.crowdControl?.allowImages || null
};
