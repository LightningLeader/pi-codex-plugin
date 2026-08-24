const CMD_META_PATTERN = /[\0\r\n"&|<>^%!()]/;

function quoteSafeCmdToken(value, label) {
  const token = String(value ?? "");
  if (!token) {
    throw new Error(`${label} cannot be empty.`);
  }
  if (CMD_META_PATTERN.test(token)) {
    throw new Error(`${label} contains characters that are unsafe for the Windows command shell.`);
  }
  return /\s/.test(token) ? `"${token}"` : token;
}

// Windows npm binaries are .cmd shims and therefore require cmd.exe, while
// native Pi distributions may expose pi.exe. Let cmd.exe resolve the bare
// `pi` name through PATHEXT, but pass one prevalidated command string instead
// of spawn(command, args, { shell: true }), whose args are not escaped.
export function buildSafeWindowsShellCommand(command, args = []) {
  return [
    quoteSafeCmdToken(command, "Command"),
    ...args.map((arg, index) => quoteSafeCmdToken(arg, `Argument ${index + 1}`))
  ].join(" ");
}
