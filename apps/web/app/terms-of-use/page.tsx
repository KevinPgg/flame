"use client";

import { useState } from "react";
import { Navbar, Footer } from "../components";

const proseClasses =
  "[&_h1]:text-2xl [&_h1]:leading-8 [&_h1]:font-poppins-semibold [&_h1]:text-white-100 [&_h1]:mb-6 " +
  "[&_h2]:text-lg [&_h2]:font-poppins-semibold [&_h2]:text-white-100 [&_h2]:mt-8 [&_h2]:mb-3 " +
  "[&_h3]:text-base [&_h3]:font-poppins-semibold [&_h3]:text-white-100 [&_h3]:mt-6 [&_h3]:mb-2 " +
  "[&_p]:text-sm [&_p]:leading-[22px] [&_p]:font-poppins [&_p]:text-white-80 [&_p]:mb-3 " +
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 " +
  "[&_li]:text-sm [&_li]:leading-[22px] [&_li]:font-poppins [&_li]:text-white-80 [&_li]:mb-1 " +
  "[&_strong]:text-white-100 [&_strong]:font-poppins-semibold " +
  "[&_a]:text-white-100 [&_a]:underline [&_a]:transition-colors";

export default function TermsOfUsePage() {
  const [language, setLanguage] = useState<"en" | "es">("en");

  const scrollToSection = (lang: "en" | "es") => {
    setLanguage(lang);
    const element = document.getElementById(lang === "en" ? "english" : "spanish");
    element?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <div className="flex-1 pt-16">
        <div className="max-w-[800px] mx-auto px-4 py-12">
          {/* Language Toggle */}
          <div className="flex items-center gap-3 mb-10 pb-6 border-b border-white-20">
            <button
              onClick={() => scrollToSection("en")}
              className={`text-sm font-poppins-medium px-4 py-2 rounded-pill transition-colors ${
                language === "en"
                  ? "bg-white-100 text-dark"
                  : "text-white-50 hover:text-white-100"
              }`}
            >
              Read in English
            </button>
            <span className="text-white-30 font-poppins text-sm">|</span>
            <button
              onClick={() => scrollToSection("es")}
              className={`text-sm font-poppins-medium px-4 py-2 rounded-pill transition-colors ${
                language === "es"
                  ? "bg-white-100 text-dark"
                  : "text-white-50 hover:text-white-100"
              }`}
            >
              Leer en Español
            </button>
          </div>

          {/* English Section */}
          <div id="english" className={`mb-16 scroll-mt-20 ${proseClasses}`}>
            <h1>TERMS AND CONDITIONS</h1>
            <p>
              <strong>Last Updated: March 31, 2026</strong>
            </p>

            <p>
              These Terms and Conditions (hereinafter, the &quot;Terms&quot;) govern the
              access to and use of all versions of the Platform FLAME, whether
              used through the mobile application and/or the website (hereinafter,
              the &quot;Platform&quot;), owned and operated by FLAME LLC, a limited liability
              company organized under the laws of the State of Florida, United
              States of America.
            </p>

            <p>
              By downloading the application, carrying out a transaction through
              the application or the website, registering, or generally using the
              Platform FLAME, the user (hereinafter, the &quot;User&quot;) declares to have
              read, understood, and fully accepted these Terms, which may be
              updated by the Company and shall be applicable as from
              their publication. The User irrevocably accepts the following
              terms and conditions for online ticket purchases made through the
              platforms or websites of FLAME, as detailed below:
            </p>

            <h2>1. Eligibility</h2>

            <p>
              You must be at least 18 years of age (or the age of majority in
              your jurisdiction) to create an account or make purchases on the
              Platform. If you are between 13 and 17 years of age, you may only
              use the Platform with the consent and supervision of a parent or
              legal guardian who agrees to be bound by these Terms on your behalf.
              Users under 13 years of age are not permitted to use the Platform.
            </p>

            <p>
              By using the Platform, you represent and warrant that you meet the
              eligibility requirements described above and that you have the legal
              capacity to enter into a binding agreement.
            </p>

            <h2>2. Definitions</h2>

            <p>
              <strong>User:</strong> Any person using the Platform, either through
              the website or the mobile application. Users are solely responsible
              for reading the content of the terms and conditions governing the
              use of the Platform and its services. Upon registration and creation
              of an account, the User shall be solely responsible for complying
              with the applicable regulations and must provide truthful and
              accurate personal information.
            </p>

            <p>
              <strong>Organizer:</strong> Entrepreneur, producer, or third party
              responsible for holding the events published on the Platform. Organizers
              who receive payouts through the Platform are subject to a separate{" "}
              <a href="/organizer-agreement">Organizer Agreement</a> and the terms of our third-party payment processor.
            </p>

            <p>
              <strong>Electronic Ticket:</strong> Digital receipt issued by the
              Platform granting the User the right of access to an event.
            </p>

            <p>
              The events displayed on FLAME are neither the responsibility of nor
              organized by FLAME LLC. The organizers are solely responsible for
              the commercialization, promotion, and display of tickets for their
              events. Therefore, FLAME LLC shall bear no responsibility for
              the execution of the same and shall be released from any eventuality
              that may occur therein. The Organizer, whether a natural or legal
              person, shall be solely responsible for the proper execution of the
              event.
            </p>

            <h2>3. Purpose of the Service</h2>

            <p>The Platform solely allows the User to:</p>

            <ul>
              <li>
                Purchase electronic tickets for events organized by third parties,
                as indicated above.
              </li>
              <li>
                Receive confirmations and digital tickets in the registered email
                account or through the application.
              </li>
              <li>
                Access information related to events published by different
                organizers.
              </li>
            </ul>

            <p>
              The User acknowledges that the role of FLAME LLC is solely that
              of an intermediary to facilitate the sale and promotion of tickets,
              and it is established that it is neither responsible for nor a
              co-organizer of the events. Therefore, in case of complaints, the
              User must direct any claims to the Organizer. FLAME LLC may
              remove or update services, features, or functionalities without
              prior notice or the User&apos;s consent.
            </p>

            <h2>4. Intellectual Property</h2>

            <p>
              All content on the Platform (source code, graphics, texts, logos,
              images, videos, audio, etc.) that does not correspond to the
              intellectual property of the organizers is owned by FLAME LLC
              and is protected under United States and international intellectual
              property laws.
            </p>

            <p>
              The texts, designs, images, audio, databases, logos, structure,
              trademarks, and other elements of the site are protected by the
              intellectual and industrial property rights of FLAME LLC.
            </p>

            <h2>5. Purchase Conditions and Payment Processing</h2>

            <p>
              The User is responsible for carefully verifying the number of
              tickets, date, time, performance, and location of events before
              confirming the purchase. FLAME LLC is not responsible for errors
              in quantities or incorrect dates in purchases and will not be
              obliged to reimburse any amount in such cases.
            </p>

            <p>
              All purchases are final and binding. There will be no changes,
              cancellations, or refunds, except in cases of event cancellation due
              to force majeure, acts of God, or as expressly authorized by the
              Organizer.
            </p>

            <p>
              The User expressly authorizes FLAME LLC to charge the &quot;service
              fee&quot; applied to each purchase, which is non-refundable
              under any circumstance and may be set and modified at FLAME LLC&apos;s
              discretion. The service fee amount will be clearly displayed to the
              User before the purchase is confirmed.
            </p>

            <p>
              All payments on the Platform are processed by <strong>Stripe, Inc.</strong>,
              a third-party payment processor. By making a purchase, you agree to
              Stripe&apos;s{" "}
              <a href="https://stripe.com/legal/consumer" target="_blank" rel="noopener noreferrer">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">
                Privacy Policy
              </a>.
              FLAME LLC does not store credit card or debit card information.
              All payment data is handled directly by Stripe in accordance with
              PCI-DSS standards.
            </p>

            <p>
              FLAME LLC reserves the right to suspend Users from the Platform
              or disable digital tickets if there is any claim or suspicion of
              fraudulent use.
            </p>

            <p>
              Likewise, FLAME LLC reserves the right to suspend Organizers for
              unjustified cancellation of events or suspicion of fraudulent acts
              through events.
            </p>

            <h2>6. Ticket Resale and Transfer</h2>

            <p>
              Tickets purchased through FLAME are for personal use only. The resale,
              transfer, or attempted resale or transfer of tickets for commercial
              gain is strictly prohibited. Any ticket found to have been resold or
              transferred in violation of these Terms may be cancelled without refund,
              and the associated account may be suspended or terminated at FLAME LLC&apos;s
              sole discretion.
            </p>

            <p>
              FLAME LLC may, at its discretion, offer a ticket transfer feature
              that allows Users to transfer tickets to other registered Users. When
              available, transfers are subject to restrictions set by the Organizer
              and may not be used for commercial purposes.
            </p>

            <h2>7. Event Cancellations and Refund Policy</h2>

            <p>
              In the event of an event cancellation, the exclusive responsibility
              for refunding any amounts rests with the Organizer.
            </p>

            <p>
              Where a prior agreement exists, FLAME LLC may manage refunds or
              exchanges on behalf of the Organizer, following the communication
              mechanisms established (official email).
            </p>

            <p>
              Failure of the User to attend the event does not entitle the User to
              a refund or ticket exchange.
            </p>

            <h2>8. Event Responsibility</h2>

            <p>
              The Organizer shall be solely responsible for the execution of the
              event and shall therefore be solely responsible for obtaining all
              permits required by law, as well as for complying with any
              permits, fees, or procedures and with any competent regulatory
              authority necessary for the event&apos;s execution. Consequently,
              FLAME LLC shall bear no responsibility should any regulatory
              authority or other competent authority issue requirements in this
              regard.
            </p>

            <p>
              If an event is canceled due to lack of documentation and/or permits,
              the Organizer shall manage the refund of the ticket amounts in
              accordance with FLAME LLC&apos;s event cancellation policies, and the
              Organizer shall bear the cost of the service fees.
            </p>

            <h2>9. Account Termination</h2>

            <p>
              FLAME LLC reserves the right to suspend or terminate your account
              and access to the Platform at any time, with or without notice, for
              conduct that FLAME LLC, in its sole discretion, believes violates
              these Terms, is harmful to other Users, Organizers, or third parties,
              or for any other reason.
            </p>

            <p>
              You may terminate your account at any time by contacting us at{" "}
              <a href="mailto:support@flme.co">support@flme.co</a>. Upon
              termination, your right to access the Platform ceases immediately.
              Any tickets already purchased remain subject to the applicable event
              terms.
            </p>

            <h2>10. Disclaimer of Warranties</h2>

            <p>
              THE PLATFORM AND ALL CONTENT, SERVICES, AND FEATURES MADE AVAILABLE
              THROUGH THE PLATFORM ARE PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS
              AVAILABLE&quot; BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS
              OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, OR
              NON-INFRINGEMENT.
            </p>

            <p>
              FLAME LLC does not warrant that the Platform will be
              uninterrupted, error-free, or free of viruses or other harmful
              components. FLAME LLC does not warrant or make any representations
              regarding the quality, accuracy, or reliability of any events listed
              on the Platform.
            </p>

            <h2>11. Limitation of Liability</h2>

            <p>
              TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, FLAME LLC, ITS
              OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR
              ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
              DAMAGES, INCLUDING WITHOUT LIMITATION, LOSS OF PROFITS, DATA, USE,
              GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM: (A) YOUR
              ACCESS TO OR USE OF OR INABILITY TO ACCESS OR USE THE PLATFORM; (B)
              ANY CONDUCT OR CONTENT OF ANY THIRD PARTY, ORGANIZER, OR USER ON
              THE PLATFORM; (C) ANY EVENT ATTENDED THROUGH TICKETS PURCHASED ON
              THE PLATFORM; OR (D) UNAUTHORIZED ACCESS, USE, OR ALTERATION OF
              YOUR CONTENT OR INFORMATION.
            </p>

            <p>
              IN NO EVENT SHALL FLAME LLC&apos;S AGGREGATE LIABILITY FOR ALL CLAIMS
              RELATED TO THE PLATFORM EXCEED THE GREATER OF (A) THE AMOUNT YOU
              PAID TO FLAME LLC IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM,
              OR (B) ONE HUNDRED U.S. DOLLARS ($100.00).
            </p>

            <h2>12. Indemnification</h2>

            <p>
              You agree to indemnify, defend, and hold harmless FLAME LLC, its
              officers, directors, employees, agents, and affiliates from and
              against any and all claims, liabilities, damages, losses, costs, and
              expenses (including reasonable attorneys&apos; fees) arising out of or
              in any way connected with: (a) your access to or use of the
              Platform; (b) your violation of these Terms; (c) your violation of
              any third-party right, including any intellectual property or privacy
              right; or (d) any claim that your use of the Platform caused damage
              to a third party.
            </p>

            <h2>13. Privacy</h2>

            <p>
              FLAME LLC is committed to protecting User privacy. Please review
              our{" "}
              <a href="/privacy-policy">Privacy Policy</a> for information on
              how we collect, use, and protect your personal data.
            </p>

            <p>
              By using the services provided by FLAME LLC or making a
              purchase, the User expressly accepts and agrees that their personal
              data will be processed in accordance with our Privacy Policy.
              FLAME LLC does not store credit or debit card data; all payment
              information is processed securely by Stripe.
            </p>

            <h2>14. Modification of Terms</h2>

            <p>
              FLAME LLC reserves the right, at its sole discretion, to modify
              or replace these Terms at any time. If a revision is material,
              we will provide at least 30 days&apos; notice prior to any new terms
              taking effect by posting the updated Terms on the Platform with a
              revised &quot;Last Updated&quot; date. Your continued use of the Platform after
              such changes constitutes your acceptance of the new Terms.
            </p>

            <h2>15. Dispute Resolution</h2>

            <p>
              Any dispute, claim, or controversy arising out of or relating to
              these Terms or the use of the Platform shall first be attempted to
              be resolved through good-faith negotiation between the parties. If
              the dispute cannot be resolved within thirty (30) days, either party
              may pursue binding arbitration administered under the rules of the
              American Arbitration Association (AAA), with the arbitration taking
              place in the State of Florida, United States.
            </p>

            <p>
              YOU AND FLAME LLC AGREE THAT EACH MAY BRING CLAIMS AGAINST THE
              OTHER ONLY IN YOUR OR ITS INDIVIDUAL CAPACITY, AND NOT AS A
              PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS OR REPRESENTATIVE
              PROCEEDING.
            </p>

            <h2>16. Governing Law</h2>

            <p>
              These Terms and any disputes arising hereunder shall be governed by
              and construed in accordance with the laws of the State of Florida,
              United States of America, without regard to its conflict of law
              principles.
            </p>

            <h2>17. Contact Us</h2>

            <p>
              If you have any questions about these Terms, please contact us at{" "}
              <a href="mailto:support@flme.co">support@flme.co</a>.
            </p>

            <p>
              FLAME LLC<br />
              United States of America
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-white-20 mb-16" />

          {/* Spanish Section */}
          <div id="spanish" className={`scroll-mt-20 ${proseClasses}`}>
            <h1>TÉRMINOS Y CONDICIONES</h1>
            <p>
              <strong>Última actualización: 31 de marzo de 2026</strong>
            </p>

            <p>
              Los presentes Términos y Condiciones (en adelante, los &quot;Términos&quot;)
              regulan el acceso y uso de todas las versiones de la Plataforma
              FLAME sea esta utilizada a través de aplicación móvil y/o del sitio
              web (en adelante, la &quot;Plataforma&quot;), de titularidad de FLAME LLC,
              una sociedad de responsabilidad limitada constituida bajo las leyes
              del Estado de Florida, Estados Unidos de América.
            </p>

            <p>
              Al descargar la aplicación, realizar una transacción a través de la
              aplicación o del sitio web, registrarse o en general utilizar la
              Plataforma FLAME, el usuario (en adelante, el &quot;Usuario&quot;) declara
              haber leído, comprendido y aceptado íntegramente estos Términos, los
              cuales podrán ser actualizados por la Compañía y
              serán aplicables desde su publicación. El Usuario acepta
              los siguientes términos y condiciones de la compra
              online de entradas en las plataformas o sitios web de FLAME según se
              detalla a continuación:
            </p>

            <h2>1. Elegibilidad</h2>

            <p>
              Debe tener al menos 18 años de edad (o la mayoría de edad en su
              jurisdicción) para crear una cuenta o realizar compras en la
              Plataforma. Si tiene entre 13 y 17 años de edad, solo puede usar la
              Plataforma con el consentimiento y la supervisión de un padre o
              tutor legal que acepte estar sujeto a estos Términos en su nombre.
              Los usuarios menores de 13 años no están autorizados a usar la
              Plataforma.
            </p>

            <p>
              Al utilizar la Plataforma, usted declara y garantiza que cumple con
              los requisitos de elegibilidad descritos anteriormente y que tiene la
              capacidad legal para celebrar un acuerdo vinculante.
            </p>

            <h2>2. Definiciones</h2>

            <p>
              <strong>Usuario:</strong> Este término aplica a toda persona que
              utiliza la Plataforma, ya sea a través del sitio web o de la
              aplicación móvil. Los usuarios son los únicos responsables de leer
              el contenido de los términos y condiciones que rigen el uso de la
              Plataforma con todos sus servicios. Al momento de registrarse y
              crear una cuenta, el usuario será el único responsable para el
              cumplimiento de la normativa que aplique para lo cual deberá proveer
              información personal veraz y fidedigna.
            </p>

            <p>
              <strong>Organizador:</strong> Empresario, productor o tercero
              responsable de la realización de los eventos publicados en la
              Plataforma. Los Organizadores que reciben pagos a través de la
              Plataforma están sujetos a un{" "}
              <a href="/organizer-agreement">Acuerdo de Organizador</a> separado y a
              los términos de nuestro procesador de pagos externo.
            </p>

            <p>
              <strong>Boleto electrónico o ticket:</strong> Comprobante digital
              emitido por la Plataforma que otorga al Usuario el derecho de acceso
              a un evento.
            </p>

            <p>
              Los eventos expuestos en FLAME no son responsabilidad ni organizados
              por FLAME LLC. Los organizadores son los únicos responsables de
              la comercialización, promoción y exposición de las entradas para sus
              eventos. Por lo que FLAME LLC no tendrá responsabilidad alguna
              de la realización de los mismos, quedando liberada de cualquier
              eventualidad que pueda ocurrir en los mismos. El organizador sea
              persona natural o jurídica será el único responsable de la correcta
              realización del evento.
            </p>

            <h2>3. Objeto del servicio</h2>

            <p>La Plataforma únicamente permite al Usuario:</p>

            <ul>
              <li>
                Comprar boletos electrónicos (tickets) para eventos organizados
                por terceros de acuerdo a lo indicado anteriormente.
              </li>
              <li>
                Recibir confirmaciones y boletos digitales en su correo
                electrónico registrado o en la aplicación.
              </li>
              <li>
                Acceder a información relacionada con los eventos publicados por
                diferentes organizadores.
              </li>
            </ul>

            <p>
              El usuario reconoce que el rol de FLAME LLC es únicamente de
              intermediación para facilitar la venta y promoción de boletos,
              quedando establecido que no es responsable ni co-organizador de los
              eventos, para los cuales el usuario en caso de reclamos deberá
              dirigir cualquier queja al organizador. FLAME LLC podrá eliminar
              o actualizar prestaciones, funciones y servicios sin previo aviso o
              consentimiento del usuario.
            </p>

            <h2>4. Propiedad intelectual</h2>

            <p>
              Todo el contenido de la Plataforma (código fuente, gráficos, textos,
              logos, imágenes, videos, audios, etc.) que no corresponda a
              propiedad intelectual de los organizadores es propiedad de FLAME LLC
              y se encuentra protegido por la normativa estadounidense e
              internacional de propiedad intelectual.
            </p>

            <p>
              Los textos, diseños, imágenes, audio, bases de datos, logos,
              estructura, marcas y demás elementos de este sitio están protegidos
              por los derechos de propiedad intelectual e industrial de FLAME LLC.
            </p>

            <h2>5. Condiciones de compra y procesamiento de pagos</h2>

            <p>
              El Usuario es responsable de verificar cuidadosamente las cantidades
              de boletos, fecha, hora, función y localidad de los eventos antes de
              confirmar su compra. FLAME LLC no se responsabiliza por errores
              en las cantidades o fechas equivocadas en las compras, por lo que no
              estará obligada a reembolsar ningún valor por lo mencionado.
            </p>

            <p>
              Todas las compras son finales y definitivas. No existirán cambios,
              devoluciones ni reembolsos, salvo en los casos previstos de
              cancelación de los eventos por fuerza mayor, caso fortuito o
              expresamente autorizados por el Organizador.
            </p>

            <p>
              El Usuario acepta y autoriza expresamente a FLAME LLC a cobrar
              la &quot;tasa de servicio&quot; aplicada a cada compra, la cual no es
              reembolsable bajo ninguna circunstancia y quedará a criterio de
              FLAME LLC fijarla y modificarla de estimar necesario. El monto de
              la tasa de servicio se mostrará claramente al Usuario antes de
              confirmar la compra.
            </p>

            <p>
              Todos los pagos en la Plataforma son procesados por{" "}
              <strong>Stripe, Inc.</strong>, un procesador de pagos externo. Al
              realizar una compra, usted acepta los{" "}
              <a href="https://stripe.com/legal/consumer" target="_blank" rel="noopener noreferrer">
                Términos de Servicio
              </a>{" "}
              y la{" "}
              <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">
                Política de Privacidad
              </a>{" "}
              de Stripe. FLAME LLC no almacena datos de tarjetas de crédito ni
              débito. Toda la información de pago es manejada directamente por
              Stripe de acuerdo con los estándares PCI-DSS.
            </p>

            <p>
              FLAME LLC se reserva el derecho de suspender a usuarios de la
              plataforma o de inhabilitar boletos digitales si existe algún
              reclamo o sospecha de consumos fraudulentos.
            </p>

            <p>
              Así mismo FLAME LLC se reserva el derecho de suspender a
              organizadores por la cancelación de eventos sin justificación previa
              o que tenga sospecha del cometimiento de actos fraudulentos a través
              de eventos.
            </p>

            <h2>6. Reventa y transferencia de boletos</h2>

            <p>
              Los boletos adquiridos a través de FLAME son para uso personal
              exclusivamente. La reventa, transferencia o intento de reventa o
              transferencia de boletos con fines comerciales está estrictamente
              prohibida. Cualquier boleto que se encuentre revendido o transferido
              en violación de estos Términos podrá ser cancelado sin reembolso, y
              la cuenta asociada podrá ser suspendida o terminada a discreción
              exclusiva de FLAME LLC.
            </p>

            <p>
              FLAME LLC puede, a su discreción, ofrecer una función de
              transferencia de boletos que permita a los Usuarios transferir
              boletos a otros Usuarios registrados. Cuando esté disponible, las
              transferencias estarán sujetas a las restricciones establecidas por
              el Organizador y no podrán utilizarse con fines comerciales.
            </p>

            <h2>7. Política de cancelación de eventos y reembolsos</h2>

            <p>
              En caso de cancelación de un evento, la responsabilidad exclusiva de
              la devolución de cualquier valor recae sobre el Organizador.
            </p>

            <p>
              Cuando exista acuerdo previo, FLAME LLC podrá gestionar
              devoluciones o canjes en nombre del Organizador, siguiendo los
              mecanismos de comunicación establecidos (correo electrónico
              oficial).
            </p>

            <p>
              La no asistencia del Usuario al evento no genera derecho a
              devolución ni cambio de boletos.
            </p>

            <h2>8. Responsabilidad del evento</h2>

            <p>
              El Organizador será el único responsable por la realización del
              evento, por lo que este será el único responsable de contar con
              todos los permisos que exija la Ley, así como el cumplimiento de
              cualquier permiso, tasa o trámite y de cualquier organismo
              de control competente necesarios para la realización de su evento;
              en consecuencia, FLAME LLC queda deslindado de toda
              responsabilidad si se presentase algún requerimiento por parte del
              organismo de control, o de otra autoridad competente por esta
              circunstancia.
            </p>

            <p>
              Si el evento es cancelado por falta de documentación y/o permisos
              el Organizador deberá gestionar la devolución del dinero de los
              tickets de acuerdo a las políticas de cancelación de eventos de
              FLAME LLC, para lo cual este deberá asumir el costo de los fees
              de servicio.
            </p>

            <h2>9. Terminación de cuenta</h2>

            <p>
              FLAME LLC se reserva el derecho de suspender o terminar su cuenta
              y acceso a la Plataforma en cualquier momento, con o sin previo
              aviso, por conductas que FLAME LLC, a su exclusiva discreción,
              considere que violan estos Términos, son perjudiciales para otros
              Usuarios, Organizadores o terceros, o por cualquier otra razón.
            </p>

            <p>
              Puede terminar su cuenta en cualquier momento contactándonos en{" "}
              <a href="mailto:support@flme.co">support@flme.co</a>. Al momento de
              la terminación, su derecho de acceso a la Plataforma cesa
              inmediatamente. Los boletos ya adquiridos permanecen sujetos a los
              términos del evento aplicable.
            </p>

            <h2>10. Descargo de garantías</h2>

            <p>
              LA PLATAFORMA Y TODO EL CONTENIDO, SERVICIOS Y FUNCIONES
              DISPONIBLES A TRAVÉS DE LA PLATAFORMA SE PROPORCIONAN &quot;TAL CUAL&quot; Y
              &quot;SEGÚN DISPONIBILIDAD&quot; SIN GARANTÍAS DE NINGÚN TIPO, YA SEAN
              EXPRESAS O IMPLÍCITAS, INCLUYENDO PERO NO LIMITADO A GARANTÍAS DE
              COMERCIABILIDAD, IDONEIDAD PARA UN PROPÓSITO PARTICULAR, TÍTULO O NO
              INFRACCIÓN.
            </p>

            <p>
              FLAME LLC no garantiza que la Plataforma sea ininterrumpida, libre
              de errores o libre de virus u otros componentes dañinos. FLAME LLC
              no garantiza ni hace representaciones sobre la calidad, precisión o
              confiabilidad de los eventos listados en la Plataforma.
            </p>

            <h2>11. Limitación de responsabilidad</h2>

            <p>
              EN LA MÁXIMA MEDIDA PERMITIDA POR LA LEY APLICABLE, FLAME LLC, SUS
              DIRECTORES, EMPLEADOS Y AGENTES NO SERÁN RESPONSABLES POR DAÑOS
              INDIRECTOS, INCIDENTALES, ESPECIALES, CONSECUENTES O PUNITIVOS,
              INCLUYENDO SIN LIMITACIÓN, LA PÉRDIDA DE BENEFICIOS, DATOS, USO,
              FONDO DE COMERCIO U OTRAS PÉRDIDAS INTANGIBLES.
            </p>

            <p>
              EN NINGÚN CASO LA RESPONSABILIDAD TOTAL DE FLAME LLC POR TODAS LAS
              RECLAMACIONES RELACIONADAS CON LA PLATAFORMA EXCEDERÁ EL MAYOR ENTRE
              (A) EL MONTO QUE USTED PAGÓ A FLAME LLC EN LOS DOCE (12) MESES
              ANTERIORES A LA RECLAMACIÓN, O (B) CIEN DÓLARES ESTADOUNIDENSES
              ($100.00 USD).
            </p>

            <h2>12. Indemnización</h2>

            <p>
              Usted acepta indemnizar, defender y mantener indemne a FLAME LLC,
              sus directores, empleados, agentes y afiliados de y contra cualquier
              reclamación, responsabilidad, daños, pérdidas, costos y gastos
              (incluyendo honorarios razonables de abogados) que surjan de o estén
              relacionados con: (a) su acceso o uso de la Plataforma; (b) su
              violación de estos Términos; (c) su violación de cualquier derecho
              de terceros; o (d) cualquier reclamación de que su uso de la
              Plataforma causó daño a un tercero.
            </p>

            <h2>13. Privacidad</h2>

            <p>
              FLAME LLC se compromete a proteger la privacidad del Usuario. Por
              favor consulte nuestra{" "}
              <a href="/privacy-policy">Política de Privacidad</a> para obtener
              información sobre cómo recopilamos, usamos y protegemos sus datos
              personales.
            </p>

            <p>
              Al usar los servicios provistos por FLAME LLC o realizar una
              compra, usted expresamente acepta y acuerda que sus datos personales
              serán procesados de acuerdo con nuestra Política de Privacidad.
              FLAME LLC no almacena datos de tarjetas de crédito ni débito; toda
              la información de pago es procesada de forma segura por Stripe.
            </p>

            <h2>14. Modificación de los términos</h2>

            <p>
              FLAME LLC se reserva el derecho, a su discreción, de modificar o
              reemplazar estos Términos en cualquier momento. Si una revisión es
              sustancial, proporcionaremos al menos 30 días de aviso antes de que
              los nuevos términos entren en vigor publicando los Términos
              actualizados en la Plataforma con una fecha de &quot;Última
              actualización&quot; revisada. Su uso continuado de la Plataforma después
              de dichos cambios constituye su aceptación de los nuevos Términos.
            </p>

            <h2>15. Resolución de disputas</h2>

            <p>
              Cualquier disputa, reclamación o controversia que surja de o esté
              relacionada con estos Términos o el uso de la Plataforma se
              intentará resolver primero mediante negociación de buena fe entre las
              partes. Si la disputa no puede resolverse en treinta (30) días,
              cualquiera de las partes podrá recurrir a arbitraje vinculante
              administrado bajo las reglas de la Asociación Americana de Arbitraje
              (AAA), con el arbitraje teniendo lugar en el Estado de Florida,
              Estados Unidos.
            </p>

            <p>
              USTED Y FLAME LLC ACUERDAN QUE CADA UNO SOLO PODRÁ PRESENTAR
              RECLAMACIONES CONTRA EL OTRO EN SU CAPACIDAD INDIVIDUAL, Y NO COMO
              DEMANDANTE O MIEMBRO DE CLASE EN CUALQUIER PROCEDIMIENTO COLECTIVO O
              REPRESENTATIVO.
            </p>

            <h2>16. Legislación aplicable</h2>

            <p>
              Estos Términos y cualquier disputa que surja en virtud de los mismos
              se regirán e interpretarán de acuerdo con las leyes del Estado de
              Florida, Estados Unidos de América, sin tener en cuenta sus
              principios de conflicto de leyes.
            </p>

            <h2>17. Contáctenos</h2>

            <p>
              Si tiene alguna pregunta sobre estos Términos, contáctenos en{" "}
              <a href="mailto:support@flme.co">support@flme.co</a>.
            </p>

            <p>
              FLAME LLC<br />
              Estados Unidos de América
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
