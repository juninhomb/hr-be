describe('Ship2U', () => {
  const LOGIN_URL = 'https://ship2u.pt/en/customer-account/login'

  beforeEach(() => {
    cy.clearAllCookies()
    cy.clearAllLocalStorage()
    cy.clearAllSessionStorage()
  })

  it(
    'login, new shipment: Way2U + sender, recipient from RECIPIENT_FILE, volumes, weight',
    () => {
      cy.on('uncaught:exception', (err) => {
        if (err.message.includes('shift is not a function')) return false
      })

      const recipientFile = Cypress.env('RECIPIENT_FILE')
      expect(recipientFile, 'Cypress --env RECIPIENT_FILE=/caminho/recipient.json').to.be.a(
        'string',
      ).and.not.be.empty

      cy.task('loadShip2uRecipient', { path: recipientFile }).then((recipient) => {
        expect(recipient).to.include.keys(
          'full_name',
          'email',
          'address',
          'postal_code',
          'phone',
        )

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

          cy.get('#modal-remote-xl input[name="active_email"]').check({ force: true })

          cy.get('#modal-remote-xl input[name="recipient_email"]', { timeout: 10000 })
            .should('exist')
            .and('not.be.disabled')
            .scrollIntoView()
            .click({ force: true })
            .clear({ force: true })
            .type(recipient.email, { force: true })

          const recipientNameSel = '#modal-remote-xl input[name="recipient_name"]'

          const dismissRecipientSuggestions = () => {
            cy.get(recipientNameSel).blur({ force: true })
            cy.wait(150)
            cy.get('#modal-remote-xl .modal-header').filter(':visible').first().click('bottomLeft', {
              force: true,
            })
            cy.wait(150)
          }

          cy.get(recipientNameSel)
            .clear({ force: true })
            .type(recipient.full_name, { force: true })
            .should(($el) => {
              const v = String($el.val() || '').trim()
              const last = String(recipient.full_name || '')
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .pop()
              expect(
                v.length > 0,
                'recipient_name deve ter valor após digitar o cliente',
              ).to.be.true
              if (last) {
                expect(
                  v.toLowerCase(),
                  'recipient_name deve reflectir o nome do cliente (Ship2U pode alterar maiúsculas)',
                ).to.include(last.toLowerCase())
              }
            })

          cy.wait(600)

          dismissRecipientSuggestions()

          cy.get('#modal-remote-xl input[name="recipient_address"]')
            .clear({ force: true })
            .type(recipient.address, { force: true })

          cy.get('#modal-remote-xl #recipient_zip_code')
            .clear({ force: true })
            .type(recipient.postal_code, { force: true })

          cy.get('#modal-remote-xl #recipient_phone')
            .clear({ force: true })
            .invoke('val', recipient.phone)
            .trigger('input', { force: true })
            .trigger('change', { force: true })
            .trigger('blur', { force: true })

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

          cy.get('html', { timeout: 120000 }).should(($html) => {
            const $modal = $html.find('#modal-remote-xl')
            const el = $modal[0]
            const ok = !el || !Cypress.dom.isVisible(el)
            expect(
              ok,
              'modal #modal-remote-xl deve fechar ou ficar oculto após submeter (senão o envio pode não ter sido aceite)',
            ).to.be.true
          })
        })
      })
    },
  )
})
