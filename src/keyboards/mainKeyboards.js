import { Markup } from 'telegraf';
import { BUTTONS } from '../config/constants.js';

/**
 * Main Home Menu Keyboard
 */
export function getMainMenuKeyboard(isAdmin = false) {
  const keyboard = [
    [BUTTONS.BALANCE, BUTTONS.DEPOSIT],
    [BUTTONS.BUY_PROMO],
    [BUTTONS.MY_PROMOS, BUTTONS.PROFILE],
  ];

  if (isAdmin) {
    keyboard.push([BUTTONS.ADMIN_PANEL]);
  }

  return Markup.keyboard(keyboard).resize();
}

/**
 * Back to previous page / Main menu keyboard
 */
export function getBackKeyboard() {
  return Markup.keyboard([[BUTTONS.BACK, BUTTONS.MAIN_MENU]]).resize();
}

/**
 * Cancel keyboard
 */
export function getCancelKeyboard() {
  return Markup.keyboard([[BUTTONS.CANCEL]]).resize();
}
