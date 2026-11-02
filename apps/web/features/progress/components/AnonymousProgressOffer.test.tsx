import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetProgressStoreForTests, useProgressStore } from "../state/use-progress-store";
import { AnonymousProgressOffer } from "./AnonymousProgressOffer";

afterEach(() => {
  resetProgressStoreForTests();
});

describe("AnonymousProgressOffer", () => {
  it("renders nothing without an offer", () => {
    const { container } = render(<AnonymousProgressOffer />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says what would be added, warns about shared computers, and hides on Not now", async () => {
    const user = userEvent.setup();
    act(() => {
      useProgressStore.setState({ anonymousOffer: { lessons: 2, challenges: 1, practice: 0 } });
    });
    render(<AnonymousProgressOffer />);
    const offer = screen.getByRole("region", { name: /signed-out progress/ });
    expect(offer).toHaveTextContent("2 lessons and 1 challenge you finished while signed out");
    expect(offer).toHaveTextContent("on a shared computer");
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByTestId("anonymous-progress-offer")).toBeNull();
  });
});
