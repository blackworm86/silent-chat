import { describe, it, expect } from 'vitest';
import { inviteHashFrom } from '../src/client/scanparse';

const O = 'https://user.github.io', P = '/silent-chat/';
describe('what a scanned QR may open', () => {
  it('accepts this app\'s player invite, with or without the key', () => {
    expect(inviteHashFrom('https://user.github.io/silent-chat/#/r/ABC234?k=pass%20word', O, P)).toBe('#/r/ABC234?k=pass%20word');
    expect(inviteHashFrom('https://user.github.io/silent-chat/#/r/ABC234', O, P)).toBe('#/r/ABC234');
    expect(inviteHashFrom('https://user.github.io/silent-chat/index.html#/r/ABCD', O, P)).toBe('#/r/ABCD');
    expect(inviteHashFrom('  https://user.github.io/silent-chat#/r/ABCD  ', O, P)).toBe('#/r/ABCD');
  });
  it('refuses other sites, other pages, table links and plain text', () => {
    expect(inviteHashFrom('https://evil.example/silent-chat/#/r/ABC234', O, P)).toBeNull();
    expect(inviteHashFrom('https://user.github.io/other/#/r/ABC234', O, P)).toBeNull();
    expect(inviteHashFrom('https://user.github.io/silent-chat/#/t/ABC234', O, P)).toBeNull();     // the table link is for tablets
    expect(inviteHashFrom('https://user.github.io/silent-chat/#/diag', O, P)).toBeNull();
    expect(inviteHashFrom('https://user.github.io/silent-chat/#/r/AB', O, P)).toBeNull();
    expect(inviteHashFrom('hello world', O, P)).toBeNull();
    expect(inviteHashFrom('javascript:alert(1)', O, P)).toBeNull();
  });
});
