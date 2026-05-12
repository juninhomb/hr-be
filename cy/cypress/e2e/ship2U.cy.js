describe('Ship2U', () => {
  const LOGIN_URL = 'https://ship2u.pt/en/customer-account/login'
  const DASHBOARD_URL = 'https://ship2u.pt/en/customer-account'

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
    })
  })
})
