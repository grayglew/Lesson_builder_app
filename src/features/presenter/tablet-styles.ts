/** Screen-only teacher chrome. Lesson artwork and print layouts keep their own styles. */
export const TABLET_PRESENTER_CSS = `
.presenter-command-row,.presenter-modes,.presenter-view-tools,.presenter-disclosure,.presenter-popover,.presenter-action-group{display:contents}
.presenter-tools [hidden]{display:none!important}
@media screen{
  .presenter-classroom{--console-ink:#172c29;--console-muted:#526864;--console-line:#c7d6d2;--console-accent:#126458;--console-surface:#fcfefc;overflow:hidden;background:#e6eeeb}
  .presenter-classroom .lesson-header{display:none}
  .presenter-classroom .presenter-tools{
    box-sizing:border-box;display:flex;justify-content:space-between;gap:0;left:0;right:0;top:0;max-width:none;transform:none;
    padding:calc(3px + env(safe-area-inset-top)) max(4px,env(safe-area-inset-right)) 3px max(4px,env(safe-area-inset-left));
    background:var(--console-surface);border:0;border-bottom:1px solid var(--console-line);border-radius:0;
    box-shadow:0 4px 15px #173d3115;overflow:visible;touch-action:manipulation;white-space:normal
  }
  .presenter-pager,.presenter-modes,.presenter-view-tools{display:flex;align-items:center;gap:0}
  .presenter-pager{flex:0 1 10rem;min-width:0}
  #presenter-slide-position{flex:1;min-width:0;text-align:center;line-height:1.13;color:var(--console-ink)}
  #presenter-slide-position span,#presenter-slide-position strong{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  #presenter-slide-position span{color:var(--console-muted);font-size:.75rem;font-weight:750;font-variant-numeric:tabular-nums}
  #presenter-slide-position strong{font-size:.86rem;margin-top:.2rem}
  .presenter-classroom .presenter-tool{
    display:inline-flex;align-items:center;justify-content:center;gap:.4rem;min-width:44px;min-height:44px;
    padding:.35rem .62rem;border-color:var(--console-line);border-radius:.42rem;background:#fff;color:var(--console-ink);
    font-size:.88rem;line-height:1.12;touch-action:manipulation
  }
  .presenter-classroom .presenter-tool:hover{background:#eaf4f0;border-color:#799991}
  .presenter-classroom .presenter-tool:is(:disabled,[aria-disabled="true"]){color:#647b74;background:#eef2f0;cursor:default}
  .presenter-classroom .presenter-tool.is-active,.presenter-classroom .presenter-tool.primary{background:var(--console-accent);border-color:var(--console-accent);color:white}
  .presenter-classroom .presenter-tools :is(.presenter-pager,.presenter-modes,.presenter-view-tools) .presenter-tool,
  .presenter-classroom :is(#presenter-undo,.presenter-session-tool),
  .presenter-classroom .presenter-disclosure > .presenter-tool{
    padding:0;width:44px;border-color:transparent;background:transparent
  }
  .presenter-classroom .presenter-tools .presenter-tool.is-active{background:var(--console-accent);border-color:var(--console-accent)}
  .presenter-classroom .presenter-tools .presenter-tool:not(.is-active):hover{background:#eaf4f0}
  .presenter-classroom .presenter-tools .presenter-tool:disabled{color:#768682}
  .presenter-tool-label{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
  .presenter-tool[aria-pressed="false"] .presenter-on-icon,.presenter-tool[aria-pressed="true"] .presenter-off-icon{display:none}
  .presenter-classroom #presenter-save-builder:not(:disabled){color:var(--console-accent)}
  .presenter-session-tool:not([aria-busy="true"]) .presenter-busy-icon,
  .presenter-session-tool[aria-busy="true"] .presenter-idle-icon{display:none}
  .presenter-classroom .presenter-tool:focus-visible,.presenter-classroom .presenter-student-code:focus-visible{outline:3px solid var(--console-accent);outline-offset:2px}
  .presenter-classroom .presenter-disclosure{display:block;position:relative}
  .presenter-classroom .presenter-tool[aria-expanded="true"]{border-color:var(--console-accent);background:#e5f3ed}
  .presenter-classroom .presenter-popover{
    box-sizing:border-box;display:grid;gap:.35rem;position:absolute;z-index:2;top:calc(100% + .55rem);min-width:15rem;
    max-height:calc(100dvh - var(--presenter-toolbar-space) - 1rem);overflow:auto;padding:.65rem;
    background:var(--console-surface);border:1px solid var(--console-line);border-radius:.6rem;box-shadow:0 12px 30px #142f2850
  }
  .presenter-classroom .presenter-popover .presenter-tool{justify-content:flex-start;text-align:start}
  .presenter-classroom .presenter-actions{right:0}
  .presenter-classroom .presenter-action-group{display:grid;gap:.25rem}
  .presenter-action-heading{color:var(--console-muted);font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;padding:.3rem .15rem .1rem}
  .presenter-menu-title{max-width:16rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .presenter-lesson-title{display:none;min-width:0;flex:1;padding-inline:.5rem;color:var(--console-muted);font-size:.8rem;font-weight:650;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .presenter-classroom .presenter-action-group + .presenter-action-group{border-top:1px solid var(--console-line);padding-top:.25rem}
  .presenter-classroom .presenter-ink{left:0}
  #presenter-compact-ink-tools:empty{display:none}
  #presenter-compact-ink-tools .presenter-tool{width:100%}
  #presenter-compact-ink-tools .presenter-tool-label{position:static;width:auto;height:auto;clip-path:none}
  .presenter-ink-trigger svg{fill:var(--ink-colour,#2563eb);stroke:#153b32;stroke-width:1}
  .presenter-classroom .presenter-colors{gap:0}
  .presenter-classroom .presenter-color{
    display:grid;place-items:center;width:44px;height:44px;border:1px solid transparent;border-radius:.42rem;background:none
  }
  .presenter-classroom .presenter-color::before{
    content:"";width:17px;height:17px;border-radius:50%;background:var(--swatch-color);border:1px solid #172c2933
  }
  .presenter-classroom .presenter-color:hover{background:#eaf4f0}
  .presenter-classroom .presenter-color.is-active{background:#e5f3ed;box-shadow:none}
  .presenter-classroom .presenter-color.is-active::before{outline:2px solid var(--console-accent);outline-offset:3px}
  .presenter-classroom .presenter-color:focus-visible{outline:3px solid var(--console-accent);outline-offset:3px}
  .presenter-size-label{font-size:.84rem;font-weight:750;margin-top:.2rem}
  .presenter-classroom .presenter-size{height:44px;width:100%;margin:0}
  .presenter-classroom #presenter-clear{color:#a12720}
  .presenter-classroom .presenter-student-code{
    position:relative;inset:auto;min-height:44px;min-width:44px;max-width:none;box-shadow:none;padding:.35rem .65rem;
    background:#f3faf6;color:#13483d;border-color:#91b7aa;white-space:nowrap;line-height:1;
    display:grid;align-content:center;gap:.12em
  }
  .presenter-code-slot:has(.presenter-student-code:not([hidden])){flex:0 0 5.25rem;min-block-size:44px}
  .presenter-classroom .presenter-student-code[aria-pressed="false"]{inline-size:100%}
  .presenter-classroom .presenter-student-code span{font-size:.68em;letter-spacing:.04em;font-weight:750}
  .presenter-classroom .presenter-student-code strong{font-size:1em;letter-spacing:.05em}
  .presenter-classroom .presenter-student-code[aria-pressed="true"]{
    position:absolute;right:max(.8rem,env(safe-area-inset-right));top:calc(100% + .55rem);inline-size:max-content;
    max-width:calc(100vw - 1.6rem);font-size:clamp(1rem,8vw,4rem);white-space:normal;gap:.18em;
    box-shadow:0 12px 30px #142f2840;padding:.55rem .9rem
  }
  .presenter-classroom .presenter-student-code[aria-pressed="true"] span{font-size:.25em}
  .presenter-classroom .presenter-student-code small{display:none;font-size:.84rem;font-weight:650;color:var(--console-muted)}
  .presenter-classroom .presenter-student-code[aria-pressed="true"] small{display:block}
  .presenter-classroom:not(.presenter-zoom-mode) .lesson-deck{
    box-sizing:border-box;max-width:none;height:100vh;height:100dvh;overflow:auto;overscroll-behavior:contain;
    padding:var(--presenter-toolbar-space) var(--presenter-edge-space) var(--presenter-edge-space);gap:0;
    scroll-padding:var(--presenter-toolbar-space) var(--presenter-edge-space) var(--presenter-edge-space);
    align-content:start;justify-items:center
  }
  .presenter-classroom:not(.presenter-zoom-mode) .lesson-slide{
    box-sizing:border-box;width:var(--presenter-slide-width);height:var(--presenter-slide-height);max-height:none;
    --slide-spare-space:max(0px,calc(100dvh - var(--presenter-toolbar-space) - var(--presenter-edge-space) - var(--presenter-slide-height)));
    --slide-top-gap:calc(var(--slide-spare-space) * .44);
    margin-block:var(--slide-top-gap) calc(var(--slide-spare-space) - var(--slide-top-gap));
    border:1px solid #b6c9c2;box-shadow:0 6px 24px #183f2f16
  }
  .presenter-classroom:not(.presenter-zoom-mode) .lesson-slide.pdf-page-slide{margin-block:0}
  /* Keep zoom gutters in the scrolling content; padding larger than the
     viewport makes the scrollport itself grow and Fit restores a clipped slide. */
  body.presenter-classroom.presenter-zoom-mode .lesson-deck{
    width:100%;padding:var(--presenter-toolbar-space) var(--presenter-edge-space) var(--presenter-edge-space);
    scroll-padding:var(--presenter-toolbar-space) var(--presenter-edge-space) var(--presenter-edge-space);align-content:start
  }
  body.presenter-classroom.presenter-zoom-mode .lesson-deck::before,
  body.presenter-classroom.presenter-zoom-mode .lesson-deck::after{content:"";height:50vh}
  body.presenter-classroom.presenter-zoom-mode .lesson-slide{margin-inline:50vw}
  .presenter-classroom .lesson-deck:focus-visible{outline:2px solid var(--console-accent);outline-offset:-2px}
  .presenter-classroom .qa-toggle{pointer-events:none;--answer-rail:48px}
  .presenter-classroom .qa-toggle:focus-visible{outline:none}
  .presenter-classroom .qa-toggle-label{
    display:grid;place-items:center;width:44px;height:44px;box-sizing:border-box;transform:none;
    left:auto;right:3px;top:2px;padding:0;font-size:0;color:#153b32;background:#f5faf7;border:1px solid #b6c9c2;
    pointer-events:auto;cursor:pointer;touch-action:manipulation
  }
  .presenter-classroom .qa-toggle:focus-visible .qa-toggle-label{outline:2px solid var(--console-accent);outline-offset:-3px}
  .presenter-classroom .qa-toggle-label::before{
    content:"";position:absolute;inset:0;margin:auto;width:20px;height:20px;background:currentColor;
    mask:center/contain no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'%3E%3Cpath d='M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z'/%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3C/svg%3E")
  }
  .presenter-classroom .qa-toggle.is-showing-answer .qa-toggle-label{color:var(--console-accent);border-color:var(--console-accent);background:#e5f3ed}
  .presenter-classroom .qa-toggle.is-showing-answer .qa-toggle-label::after{
    content:"";position:absolute;inset:0;margin:auto;width:22px;height:0;border-top:2px solid currentColor;rotate:-43deg
  }
  .presenter-classroom .starter-cell .qa-toggle-label{top:38px}
  .presenter-classroom .qa-toggle-replace .qa-image-layer{right:var(--answer-rail)}
  .presenter-classroom .qa-toggle-append{box-sizing:border-box;padding-right:var(--answer-rail)}
  .presenter-classroom .lo-bar{font-size:.9rem}
  .presenter-classroom .example-grid{height:auto;flex:1;min-height:0}
  .presenter-classroom .example-slide{display:flex;flex-direction:column}
  .presenter-classroom .example-reveal-button{
    min-height:44px;min-width:44px;padding:.35rem .65rem;font-size:.85rem;touch-action:manipulation
  }
  .presenter-classroom .live-retrieval-controls{grid-template-columns:repeat(3,44px);gap:4px}
  .presenter-classroom .live-retrieval-button{width:44px;height:44px}
  .presenter-classroom .presenter-notification button{min-width:44px;min-height:44px}
  .presenter-classroom .presenter-dialog button{min-width:44px;min-height:44px}
  .presenter-classroom .confidence-poll-choice:disabled{opacity:.65;cursor:default}
}
@media screen and (prefers-reduced-motion:reduce){
  /* The shared near-zero transition still interpolates one frame of zoom
     geometry. Use the final geometry before measuring the scroll target. */
  .presenter-classroom,.presenter-classroom *,.presenter-classroom *::before,.presenter-classroom *::after{transition:none!important}
}
@media screen and (min-width:920px){
  .presenter-classroom .presenter-tools{justify-content:flex-start;padding-inline:max(8px,env(safe-area-inset-left)) max(8px,env(safe-area-inset-right))}
  .presenter-classroom .presenter-pager{flex-basis:clamp(8rem,17vw,15rem);padding-inline-end:4px;border-inline-end:1px solid var(--console-line)}
  .presenter-classroom .presenter-view-tools{margin-inline-start:auto}
  .presenter-classroom .presenter-code-slot:not(:empty){margin-inline-start:4px}
  .presenter-classroom .presenter-compact-view{display:none}
}
@media screen and (min-width:1080px){
  .presenter-lesson-title{display:block}
}
@media screen and (width < 920px){
  .presenter-classroom #presenter-fullscreen{display:none}
  .presenter-classroom .presenter-pager{flex-basis:7.75rem;flex-shrink:0}
  .presenter-classroom .presenter-code-slot:has(.presenter-student-code:not([hidden])){flex-basis:4rem}
  .presenter-classroom .presenter-student-code[aria-pressed="false"]{padding-inline:.2rem}
  .presenter-classroom .presenter-student-code[aria-pressed="false"] span{display:none}
  .presenter-classroom .presenter-student-code[aria-pressed="false"] strong{font-size:.8em}
  #presenter-slide-position span{font-size:.7rem;word-spacing:-.13em}
  #presenter-slide-position strong{position:absolute;width:1px;height:1px;clip-path:inset(50%)}
  .presenter-classroom .presenter-ink{left:auto;right:-44px}
}
@media screen and (width < 768px){
  .presenter-classroom .presenter-tools{flex-wrap:wrap}
  .presenter-classroom .presenter-ink{left:0;right:auto}
}
`;
