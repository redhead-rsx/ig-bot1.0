/** @jest-environment jsdom */

describe('liker.js', () => {
  test('sends a message when executed', async () => {
    jest.useFakeTimers();
    global.chrome = { runtime: { sendMessage: jest.fn() } };
    document.body.innerHTML = '<main><article><a href="/p/test/"></a><button aria-label="Unlike" aria-pressed="true"></button></article></main>';
    require('../liker.js');
    jest.runAllTimers();
    await Promise.resolve();
    expect(chrome.runtime.sendMessage).toHaveBeenCalled();
  });
});
