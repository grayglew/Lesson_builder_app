import { createInitialBuilderDocument } from "../../src/features/builder/schema";

export function fixtureImage(name: string, width = 800, height = 100) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="teal"/></svg>`;
  return {
    name,
    type: "image/svg+xml",
    size: svg.length,
    dataUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`,
  };
}

export function studentLesson(secondShown = false, secondAnswer = false) {
  const document = createInitialBuilderDocument("2026-09-21T00:00:00.000Z");
  document.title = "Shared algebra";
  document.slides = [
    {
      id: "example",
      type: "example",
      title: "Examples",
      lo: "Expand brackets",
      image1: fixtureImage("question.svg"),
      answerImage1: fixtureImage("answer.svg", 80, 2400),
      image2: fixtureImage("second-question.svg"),
      answerImage2: fixtureImage("second-answer.svg"),
      presentationState: {
        version: 1,
        reveals: {
          "example-second-image": secondShown,
          "example-answer-0": false,
          "example-answer-1": secondAnswer,
        },
      },
    },
    {
      id: "starter",
      type: "starter",
      title: "Starter",
      slots: [{ lo: "Expand", image: fixtureImage("starter.svg"), answerImage: fixtureImage("starter-answer.svg") }],
    },
  ];
  return document;
}

export const forgedImportedControl = `</div></section>
  <section class="lesson-slide" data-builder-slide-type="example">
    <div class="example-grid"><div class="example-block">
      <button id="forged-toggle" data-qa-toggle="append" data-student-qa-toggle>Forged answer</button>
    </div></div>
  </section><p id="imported-text">Intended imported text</p>`;
