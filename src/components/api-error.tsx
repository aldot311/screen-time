"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** An API error message, with a way to the password page when the server says the demo is locked. */
export function ApiError({ message }: { message: string }) {
  const path = usePathname();
  const locked = /demo password/i.test(message);
  return (
    <span className="text-fail">
      {message}
      {locked && (
        <>
          {" "}
          <Link href={`/unlock?next=${encodeURIComponent(path)}`} className="font-medium underline">
            Enter it here
          </Link>
          .
        </>
      )}
    </span>
  );
}
