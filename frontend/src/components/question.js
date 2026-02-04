import { shouldShow } from "../utils/conditional.js";

export function renderQuestion(item) {
    const wrapper = document.createElement("div");
    wrapper.className = "question";
    wrapper.id = "wrap_" + item.question.id;

    const label = document.createElement("label");
    label.innerText = item.question.number + " " + item.question.text;

    const input = document.createElement("input");
    input.id = "q_" + item.question.id;
    input.value = item.prefill || "";

    wrapper.appendChild(label);
    wrapper.appendChild(input);

    // Conditionally hide at start
    if (!shouldShow(item)) wrapper.style.display = "none";

    // When the parent changes, update conditional visibility
    if (item.question.conditionalon) {
        document
            .querySelector(`#q_${item.question.conditionalon}`)
            ?.addEventListener("change", () => {
                wrapper.style.display = shouldShow(item) ? "" : "none";
            });
    }

    return wrapper;
}
