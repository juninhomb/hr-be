describe('Ship2U', () => {
  const LOGIN_URL = 'https://ship2u.pt/en/customer-account/login'

  /**
   * Só para desenvolvimento local (`cypress open` / CLI sem runner).
   * Em produção o runner passa sempre `RECIPIENT_FILE`; sem ficheiro e sem opt-in o spec falha.
   */
  const DEV_RECIPIENT = {
    full_name: 'nome cliente teste',
    email: 'teste@gmail.com',
    address: 'Rua portugal 100, 4 esq',
    postal_code: '4430-826',
    phone: '999222000',
  }

  /** Igual ao runner: só dígitos, sem prefixo 351 (repetido). */
  function phoneNationalDigits(raw) {
    let d = String(raw ?? '').replace(/\D/g, '')
    while (d.startsWith('351') && d.length > 9) {
      d = d.slice(3)
    }
    return d
  }

  /**
   * A Ship2U re-escreve o input com 351 após máscara/blur. Forçamos dígitos nacionais com setter nativo.
   */
  function fillRecipientPhoneNational(nationalDigits) {
    const sel = '#modal-remote-xl #recipient_phone'
    const want = phoneNationalDigits(nationalDigits)

    cy.get(sel)
      .clear({ force: true })
      .click({ force: true })
      .type('{selectAll}{backspace}', { force: true })
      .type(want, { force: true, delay: 35 })
      .blur({ force: true })

    cy.get(sel).then(($input) => {
      const got = String($input.val() ?? '').replace(/\D/g, '')
      if (got.startsWith('351') && got.slice(3) === want) {
        const el = $input[0]
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set
        if (nativeSetter) {
          nativeSetter.call(el, want)
        } else {
          el.value = want
        }
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })

    cy.get(sel).should(($el) => {
      const got = String($el.val() ?? '').replace(/\D/g, '')
      expect(
        got.startsWith('351'),
        'telefone destinatário não deve manter prefixo 351 no valor do input',
      ).to.equal(false)
      expect(got, 'telefone destinatário = dígitos nacionais').to.equal(want)
    })
  }

  /**
   * Payload igual ao `OrderService.getShip2uRecipientForOrder` (JSON do `ship2uCypressRunner`).
   * Sem `RECIPIENT_FILE` o teste não usa dados fictícios a menos que `SHIP2U_ALLOW_DEV_RECIPIENT=1`.
   * @returns {Cypress.Chainable<{ full_name: string, email: string, address: string, postal_code: string, phone: string }>}
   */
  function loadRecipient() {
    const fp = Cypress.env('RECIPIENT_FILE')
    const allowDev = ['1', 'true', 'yes'].includes(
      String(Cypress.env('SHIP2U_ALLOW_DEV_RECIPIENT') ?? '')
        .trim()
        .toLowerCase(),
    )

    if (fp != null && String(fp).trim() !== '') {
      return cy.readFile(String(fp).trim()).then((raw) => {
        const data =
          typeof raw === 'object' && raw !== null ? raw : JSON.parse(String(raw))
        const digits = String(data.phone ?? '').replace(/\D/g, '')
        const phone = phoneNationalDigits(digits)
        const recipient = {
          full_name: String(data.full_name ?? '').trim(),
          email: String(data.email ?? '').trim(),
          address: String(data.address ?? '').trim(),
          postal_code: String(data.postal_code ?? '').trim(),
          phone,
        }
        const missing = ['full_name', 'email', 'address', 'postal_code', 'phone'].filter(
          (k) => !recipient[k],
        )
        if (missing.length) {
          throw new Error(
            `RECIPIENT_FILE: campos obrigatórios vazios: ${missing.join(', ')}`,
          )
        }
        return recipient
      })
    }

    if (allowDev) {
      return cy.wrap({ ...DEV_RECIPIENT })
    }

    throw new Error(
      'RECIPIENT_FILE em falta: este spec deve ser arrancado pelo ship2uCypressRunner com --env RECIPIENT_FILE=... ' +
        '(dados reais do pedido). Para testar o fluxo localmente com destinatário fictício, usa ' +
        '--env SHIP2U_ALLOW_DEV_RECIPIENT=1.',
    )
  }

  beforeEach(() => {
    cy.clearAllCookies()
    cy.clearAllLocalStorage()
    cy.clearAllSessionStorage()
  })

  it('login, new shipment: Way2U + pickup sender, country, volumes, weight', () => {
    cy.on('uncaught:exception', (err) => {
      // Ship2U minified bundles throw on Cypress focus/input simulation (r.shift is not a function)
      if (err.message.includes('shift is not a function')) return false
    })

    cy.fixture('login').then(({ username, password }) => {
      loadRecipient().then((recipient) => {
        cy.visit(LOGIN_URL)

        cy.get('#email').clear().type(username)
        cy.get('#password').type(password, { log: false })
        cy.get('button[type="submit"].btn.btn-lg.btn-block.btn-primary')
          .contains('Login')
          .click()

        cy.location('hostname', { timeout: 20000 }).should('eq', 'ship2u.pt')

        cy.location('pathname', { timeout: 20000 }).then((pathname) => {
          const onAreaCliente = /^\/area-cliente(\/|$)/.test(pathname)
          if (onAreaCliente) {
            cy.contains('a.button', 'Retroceder').should('be.visible').click()
          }
        })

        cy.url({ timeout: 20000 }).should('include', '/en/customer-account')
        cy.url().should('not.include', '/customer-account/login')

        cy.location('pathname').should('match', /^\/en\/customer-account\/?$/)

        cy.contains('a.btn-new-shipment', 'New Shipment')
          .should('be.visible')
          .click()

        cy.get('#modal-remote-xl', { timeout: 25000 }).should('be.visible')

        cy.get('#modal-remote-xl')
          .contains('label', 'Service', { matchCase: false })
          .closest('.form-group')
          .find('select')
          .should('exist')
          .select('Way2U', { force: true })

        cy.get('#modal-remote-xl')
          .contains('label', 'Service', { matchCase: false })
          .closest('.form-group')
          .find('.select2-selection__rendered')
          .should('contain.text', 'Way2U')

        cy.get('#modal-remote-xl #sender_name', { timeout: 15000 })
          .should('be.visible')
          .clear({ force: true })
          .type('LOJA HR STORE', { force: true })

        cy.get('#modal-remote-xl input[name="sender_address"]')
          .clear({ force: true })
          .type('RUA DO GENERAL TORRES 1220, PISO -1, LOJA 40', {
            force: true,
          })

        cy.get('#modal-remote-xl #sender_zip_code')
          .clear({ force: true })
          .type('4430-164', { force: true })

        cy.get('#modal-remote-xl input[name="sender_city"]')
          .should('be.visible')
          .clear({ force: true })
          .type('VILA NOVA DE GAIA', { force: true })

        cy.get('#modal-remote-xl select[name="sender_country"]')
          .should('exist')
          .select('Portugal', { force: true })

        cy.get('#modal-remote-xl #sender_phone')
          .clear({ force: true })
          .invoke('val', '913709730')
          .trigger('input', { force: true })
          .trigger('change', { force: true })
          .trigger('blur', { force: true })

        cy.get('#modal-remote-xl input[name="save_sender"]').uncheck({ force: true })

        cy.get('#modal-remote-xl input[name="save_sender"]').should('not.be.checked')

        cy.get('#modal-remote-xl #volumes')
          .clear({ force: true })
          .type('1', { force: true })

        cy.get('#modal-remote-xl #weight')
          .clear({ force: true })
          .type('1', { force: true })

        cy.get('#modal-remote-xl input[name="active_email"]').check({ force: true })

        cy.get('#modal-remote-xl input[name="recipient_email"]', { timeout: 10000 })
          .should('exist')
          .and('not.be.disabled')
          .scrollIntoView()
          .click({ force: true })
          .clear({ force: true })
          .type(recipient.email, { force: true })

        const recipientNameSel =
          '#modal-remote-xl input[name="recipient_name"]'

        const dismissRecipientSuggestions = () => {
          cy.get(recipientNameSel).blur({ force: true })
          cy.wait(150)
          // Não usar .modal-header:filter(:visible) — o Cypress pode não considerar o header visível.
          // Clicar no canto superior do diálogo fecha typeahead / overlays.
          cy.get('#modal-remote-xl').then(($modal) => {
            const $dlg = $modal.find('.modal-dialog').first()
            const target = $dlg.length ? $dlg : $modal.find('.modal-content').first()
            cy.wrap(target.length ? target : $modal)
              .click(32, 32, { force: true })
          })
          cy.wait(150)
        }

        cy.get(recipientNameSel)
          .clear({ force: true })
          .type(recipient.full_name, { force: true })
          .should(($el) => {
            const v = String($el.val() || '').trim().replace(/\s+/g, ' ')
            const want = recipient.full_name.replace(/\s+/g, ' ').trim()
            expect(
              v.toLowerCase(),
              'recipient_name alinhado com full_name (Ship2U pode forçar uppercase)',
            ).to.equal(want.toLowerCase())
          })

        cy.wait(600)

        dismissRecipientSuggestions()

        cy.get('#modal-remote-xl input[name="recipient_address"]')
          .clear({ force: true })
          .type(recipient.address, { force: true })

        cy.get('#modal-remote-xl #recipient_zip_code')
          .clear({ force: true })
          .type(recipient.postal_code, { force: true })

        fillRecipientPhoneNational(recipient.phone)

        const saveShipmentBtnSel =
          '#modal-remote-xl .modal-footer button[type="submit"].btn-black.btn-submit'

        cy.get('#modal-remote-xl').then(($modal) => {
          const body = $modal.find('.modal-body').get(0)
          if (body && body.scrollHeight > body.clientHeight) {
            body.scrollTop = body.scrollHeight
          }
        })

        dismissRecipientSuggestions()

        cy.contains(saveShipmentBtnSel, 'Save', { matchCase: false })
          .filter(':visible')
          .first()
          .scrollIntoView()
          .should('be.visible')
          .and('not.be.disabled')
          .realHover({ position: 'center' })
          .wait(150)
          .realClick({ position: 'center', clickCount: 2 })
      })
    })
  })
})