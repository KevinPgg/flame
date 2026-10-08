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

export default function PurchaseTermsPage() {
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
            <h1>DIGITAL TICKET DELIVERY POLICY</h1>
            <p>
              <strong>Last Updated: March 31, 2026</strong>
            </p>

            <p>
              Tickets purchased through FLAME, owned and operated by FLAME LLC,
              are delivered exclusively in digital format to the email address
              registered by the user at the time of purchase, under the following
              conditions:
            </p>

            <h2>1. Ticket Format</h2>

            <p>
              All event tickets promoted on FLAME are issued in digital format
              (e-tickets with a QR code or barcode).
            </p>

            <p>
              FLAME LLC will not deliver physical tickets. In the event that
              a specific event expressly offers that option, the organizer will be
              solely responsible for delivering the physical ticket, and the user
              will be responsible for collecting it at the location designated by
              the organizer.
            </p>

            <h2>2. Delivery Method</h2>

            <p>
              Once payment has been confirmed and processed, the digital tickets
              will be sent to the email address registered by the user in their
              Platform account.
            </p>

            <p>
              Additionally, the user may download their tickets directly from
              their account via the mobile application or the website.
            </p>

            <h2>3. Delivery Timeframe</h2>

            <p>
              Tickets will be sent within a maximum of 24 hours after payment
              confirmation by FLAME LLC.
            </p>

            <p>
              In most cases, delivery occurs immediately after transaction
              validation.
            </p>

            <h2>4. User Responsibility</h2>

            <p>
              The User acknowledges and agrees that they are solely responsible
              for:
            </p>

            <ul>
              <li>
                Providing a valid, active, and correctly written email address.
              </li>
              <li>
                Checking their inbox as well as spam, promotions, or junk mail
                folders.
              </li>
              <li>
                Safely storing their digital tickets and not sharing them publicly
                or with third parties.
              </li>
              <li>
                Presenting the digital ticket in a legible condition for
                validation upon entry to the event.
              </li>
            </ul>

            <p>
              FLAME LLC will not be held responsible in cases of loss,
              theft, duplication, misuse, or forgery of tickets due to causes
              attributable to the user.
            </p>

            <h2>5. Usage Instructions</h2>

            <p>
              The User must present the digital ticket at the event entrance,
              either by:
            </p>

            <ul>
              <li>Displaying it directly on their mobile device, or</li>
              <li>Presenting a printed copy (if permitted by the Organizer).</li>
            </ul>

            <p>
              Once a ticket has been validated (by scanning its QR code or
              barcode), it cannot be used again.
            </p>

            <h2>6. Support in Case of Issues</h2>

            <p>
              If the user does not receive their ticket at the registered email
              address within the stated timeframe, or encounters difficulties
              accessing it, they must immediately contact FLAME LLC customer
              support through:
            </p>

            <ul>
              <li>
                <strong>Email:</strong> <a href="mailto:support@flme.co">support@flme.co</a>
              </li>
            </ul>

            <p>
              FLAME LLC will only resend tickets to the email address
              registered in the user&apos;s account. If the user requests that the same
              ticket be sent to a different email address, their identity will
              first be verified. FLAME LLC reserves the right to refuse
              reissuance in cases of suspected fraud.
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-white-20 mb-16" />

          {/* Spanish Section */}
          <div id="spanish" className={`scroll-mt-20 ${proseClasses}`}>
            <h1>POLÍTICAS DE ENTREGA DE ENTRADAS DIGITALES</h1>
            <p>
              <strong>Última actualización: 31 de marzo de 2026</strong>
            </p>

            <p>
              La(s) entrada(s) adquirida a través de la plataforma FLAME, de
              titularidad de FLAME LLC, se entregan exclusivamente en
              formato digital, en el correo registrado por el usuario al momento
              de la compra bajo las siguientes condiciones:
            </p>

            <h2>1. Formato de la Entrada</h2>

            <p>
              Todas las entradas de los eventos promocionados en la plataforma
              FLAME son emitidas en formato digital (e-tickets con código QR o
              código de barras).
            </p>

            <p>
              FLAME LLC no entregará boletos físicos. En el caso que en
              algún evento expresamente se indique y ofrezca esa opción, será
              absoluta responsabilidad del organizador entregarla de manera física
              y será responsabilidad del usuario retirarla en el lugar que indique
              el organizador.
            </p>

            <h2>2. Medio de Entrega</h2>

            <p>
              Una vez confirmado y procesado el pago, las entradas digitales serán
              enviadas al correo electrónico registrado por el usuario en su
              cuenta de la Plataforma.
            </p>

            <p>
              Adicionalmente, el usuario podrá descargar sus boletos directamente
              desde su cuenta en la aplicación móvil o en el sitio web.
            </p>

            <h2>3. Plazo de Entrega</h2>

            <p>
              Las entradas serán enviadas en un plazo máximo de 24 horas
              posteriores a la confirmación del pago por parte de FLAME LLC.
            </p>

            <p>
              En la mayoría de los casos, el envío se realiza de manera inmediata
              tras la validación de la transacción.
            </p>

            <h2>4. Responsabilidad del Usuario</h2>

            <p>El Usuario declara y acepta que es únicamente responsable de:</p>

            <ul>
              <li>
                Proporcionar una dirección de correo electrónico válida, vigente y
                correctamente escrita.
              </li>
              <li>
                Revisar su bandeja de entrada, así como las carpetas de spam,
                promociones o correo no deseado.
              </li>
              <li>
                Conservar en buen resguardo sus boletos digitales y no
                compartirlos públicamente ni con terceros.
              </li>
              <li>
                Presentar el boleto digital en condiciones legibles para su
                validación en el acceso al evento.
              </li>
            </ul>

            <p>
              FLAME LLC no será responsable en caso de pérdida, robo,
              duplicación, mal uso o falsificación de entradas por causas
              imputables al usuario.
            </p>

            <h2>5. Instrucciones de Uso</h2>

            <p>
              El Usuario deberá presentar el boleto digital en la entrada del
              evento, ya sea:
            </p>

            <ul>
              <li>Mostrándolo directamente desde su dispositivo móvil, o</li>
              <li>
                Presentando una copia impresa (si el Organizador lo permite).
              </li>
            </ul>

            <p>
              Una vez validado un boleto (mediante escaneo del código QR o código
              de barras), no podrá ser utilizado nuevamente.
            </p>

            <h2>6. Soporte en Caso de Problemas</h2>

            <p>
              Si el usuario no recibe su entrada en el correo electrónico
              registrado dentro del plazo indicado, o presenta inconvenientes para
              acceder a ella, deberá contactar inmediatamente al servicio de
              soporte de FLAME LLC a través de:
            </p>

            <ul>
              <li>
                <strong>Correo electrónico:</strong> <a href="mailto:support@flme.co">support@flme.co</a>
              </li>
            </ul>

            <p>
              FLAME LLC solo reenviará las entradas al correo electrónico
              registrado en la cuenta del usuario. Por lo que en caso de solicitar
              el envío de la misma entrada a otra dirección que la registrada se
              procederá a validar la identidad del usuario, quedando FLAME LLC
              reservada a ejercer su derecho de no emitir en caso de sospecha de
              casos fraudulentos.
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
