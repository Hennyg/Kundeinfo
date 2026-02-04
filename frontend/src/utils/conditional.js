export function shouldShow(item) {
    if (!item.question.conditionalon) return true;

    const parentInput = document.querySelector("#q_" + item.question.conditionalon);
    if (!parentInput) return true;

    return parentInput.value === item.question.conditionalvalue;
}
