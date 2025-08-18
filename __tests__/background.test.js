describe('background.js', () => {
  test('registers message listener', () => {
    global.chrome = { runtime: { onMessage: { addListener: jest.fn() } } };
    require('../background.js');
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    const arg = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    expect(typeof arg).toBe('function');
  });
});
