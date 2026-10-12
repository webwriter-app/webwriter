import {css} from "lit"

/** Dropdown indicators overlay the field without reserving a text column. */
export const dropdownChevronStyles = css`
  .dropdown-chevron,
  .toggle.dropdown-chevron,
  .compact-toggle.dropdown-chevron {
    position: absolute;
    inset-block: auto;
    inset-block-start: 50%;
    inset-inline-end: .15rem;
    transform: translateY(-50%);
    display: grid;
    place-items: center;
    width: 1rem;
    height: 1rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgb(242 242 242 / 80%);
    z-index: 1;
  }
`
