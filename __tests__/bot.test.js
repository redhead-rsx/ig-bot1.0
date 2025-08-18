/** @jest-environment jsdom */

describe('Bot', () => {
  test('initializes with default values', () => {
    require('../bot.js');
    const bot = window.__igBot;
    expect(bot).toBeDefined();
    expect(bot.rodando).toBe(false);
    expect(bot.limite).toBe(10);
  });
});
