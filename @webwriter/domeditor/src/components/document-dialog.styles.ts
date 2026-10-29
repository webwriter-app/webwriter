import {css} from "lit"

export const documentDialogStyles = css`
  .document-dialog {
    box-sizing: border-box;
    width: min(42rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    padding: 1.25rem;
    border: 1px solid #cbd5e1;
    border-radius: 0.75rem;
    color: #202833;
    background: white;
    box-shadow: 0 1.25rem 3rem rgb(15 23 42 / 28%);
  }

  .document-dialog::backdrop { background: rgb(15 23 42 / 45%); }
  .document-dialog header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
  .document-dialog h2 { margin: 0; font-size: 1rem; }
  .document-dialog header button {
    padding: 0.35rem 0.65rem;
    border: 1px solid #cbd5e1;
    border-radius: 0.35rem;
    color: inherit;
    background: #fff;
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .document-dialog header button:hover { background: #eef4fb; }
  .confirmation-dialog { width: min(30rem, calc(100vw - 2rem)); }
  .confirmation-dialog p { margin: 0 0 1.25rem; font-size: .875rem; line-height: 1.5; }
  .confirmation-dialog footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .5rem; }
  .confirmation-dialog footer button { padding: .45rem .75rem; border: 1px solid #cbd5e1; border-radius: .35rem; color: inherit; background: white; font: inherit; font-size: .8rem; cursor: pointer; }
  .confirmation-dialog footer button:hover { background: #eef4fb; }
  .confirmation-dialog footer .primary { border-color: #155e9b; color: white; background: #155e9b; }
  .confirmation-dialog footer .primary:hover { background: #124f83; }
  .confirmation-dialog button:focus-visible { outline: 2px solid #3977c7; outline-offset: 2px; }
  .confirmation-dialog .dialog-close { display: grid; place-items: center; width: 2rem; height: 2rem; padding: 0; border: 0; }
  .confirmation-dialog .dialog-close svg { width: 1.1rem; height: 1.1rem; }
`
