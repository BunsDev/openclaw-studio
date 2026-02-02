import { describe, expect, it } from "vitest";

import {
  buildAgentInstruction,
  isUiMetadataPrefix,
  stripUiMetadata,
} from "@/lib/text/message-metadata";

describe("message-metadata", () => {
  it("builds an envelope that the UI metadata helpers can detect and strip", () => {
    const built = buildAgentInstruction({
      workspacePath: "/tmp/ws",
      message: "hello",
    });

    expect(isUiMetadataPrefix(built)).toBe(true);
    expect(stripUiMetadata(built)).toBe("hello");
  });
});
