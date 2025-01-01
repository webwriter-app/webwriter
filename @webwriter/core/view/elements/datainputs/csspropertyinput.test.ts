import expect from 'expect'
import { waitFor } from '@testing-library/dom'

// import Lit component
import { CSSPropertyInput } from './csspropertyinput'

describe('Lit Component testing', () => {
    let elem: CSSPropertyInput

    beforeEach(() => {
        elem = document.createElement('ww-css-property-input') as CSSPropertyInput
    })

    it('should render component', async () => {
        elem.setAttribute('name', 'WebdriverIO')
        document.body.appendChild(elem)

        await waitFor(() => {
            expect(elem.shadowRoot!.textContent).toBe('Hello, WebdriverIO!')
        })
    })

    afterEach(() => {
        elem.remove()
    })
})