// Creator handles, compared one way everywhere a roster name meets a video's creator. A roster built by a script holds
// plain names ("Michael K"), while uploads, request links and the API add "@" ("@Michael K"): both are one creator.
// Safe in the browser: no imports.

/** The form handles are compared in: no leading "@", lower case. "@Maya" and "maya" give "maya". */
export const handleKey = (handle: string) => handle.trim().replace(/^@+/, "").toLowerCase();

/** One creator, ignoring case and a leading "@". */
export const sameHandle = (a: string, b: string) => handleKey(a) === handleKey(b);
