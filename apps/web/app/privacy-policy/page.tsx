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

export default function PrivacyPolicyPage() {
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
            <h1>PRIVACY POLICY</h1>
            <p>
              <strong>Last Updated: March 31, 2026</strong>
            </p>

            <p>
              FLAME LLC (&quot;FLAME,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to
              protecting the privacy of our users. This Privacy Policy explains
              how we collect, use, disclose, and safeguard your information when
              you use our mobile application and website (collectively, the
              &quot;Platform&quot;). Please read this policy carefully. By using the
              Platform, you consent to the practices described herein.
            </p>

            <h2>1. Information We Collect</h2>

            <h3>Personal Information You Provide</h3>
            <p>
              When you register for an account, make a purchase, or contact us,
              we may collect the following information:
            </p>
            <ul>
              <li>Full name</li>
              <li>Email address</li>
              <li>Profile information (photo, preferences)</li>
              <li>Event attendance and purchase history</li>
            </ul>

            <h3>Information Collected Automatically</h3>
            <p>
              When you access our Platform, we may automatically collect certain
              information, including:
            </p>
            <ul>
              <li>Device information (type, operating system, unique identifiers)</li>
              <li>IP address and approximate location</li>
              <li>Browser type and version</li>
              <li>Usage data (pages visited, features used, time spent)</li>
              <li>Cookies and similar tracking technologies (see our <a href="/cookie-settings">Cookie Policy</a>)</li>
            </ul>

            <h3>Payment Information</h3>
            <p>
              Payment processing is handled by our third-party payment processor,
              Stripe, Inc. FLAME does not store, collect, or have access to your
              full credit card or debit card numbers. Stripe processes your payment
              information in accordance with PCI-DSS standards. Please refer to{" "}
              <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">
                Stripe&apos;s Privacy Policy
              </a>{" "}
              for details on how they handle your payment data.
            </p>

            <h2>2. How We Use Your Information</h2>

            <p>We use the information we collect to:</p>
            <ul>
              <li>Process ticket purchases and deliver digital tickets</li>
              <li>Create and manage your account</li>
              <li>Send order confirmations, event updates, and support communications</li>
              <li>Send promotional notifications about events (with your consent)</li>
              <li>Improve and personalize our Platform and services</li>
              <li>Detect and prevent fraud, abuse, and security incidents</li>
              <li>Comply with legal obligations</li>
            </ul>

            <h2>3. Third-Party Services and Data Sharing</h2>

            <p>
              We share your information with the following third-party service
              providers who assist us in operating the Platform:
            </p>
            <ul>
              <li>
                <strong>Stripe, Inc.</strong> — Payment processing. Stripe receives
                your payment details to process transactions securely.
              </li>
              <li>
                <strong>Clerk</strong> — Authentication and account management.
                Clerk handles your login credentials and session management.
              </li>
              <li>
                <strong>Supabase</strong> — Database and backend services. Your
                profile data, event data, and purchase history are stored securely
                on Supabase infrastructure.
              </li>
              <li>
                <strong>Brevo</strong> — Transactional email delivery. Brevo
                receives your email address to send order confirmations, event
                updates, and other service-related emails.
              </li>
              <li>
                <strong>Expo (Expo Application Services)</strong> — Push
                notification delivery. If you enable push notifications on
                the mobile app, a device-level push token is transmitted to
                Expo&apos;s push notification service to deliver event reminders,
                RSVP updates, and ticket confirmations.
              </li>
              <li>
                <strong>Google Places API</strong> — City autocomplete. When
                organizers search for a city while creating or editing an event,
                the text entered is sent to Google&apos;s Places API to provide
                location suggestions. No personal information is transmitted.
              </li>
            </ul>

            <p>
              We may also share information with <strong>Event Organizers</strong> who
              need attendee information for the events you register for or
              purchase tickets to (e.g., name and ticket details for check-in
              purposes).
            </p>

            <p>
              We do not sell your personal information to third parties.
            </p>

            <h2>4. International Data Transfers</h2>

            <p>
              FLAME LLC is based in the United States. If you access the Platform
              from outside the United States, please be aware that your information
              may be transferred to, stored, and processed in the United States and
              other countries where our service providers operate. By using the
              Platform, you consent to the transfer of your information to these
              countries, which may have data protection laws that differ from those
              in your country.
            </p>

            <h2>5. Data Retention</h2>

            <p>
              We retain your personal information for as long as your account is
              active or as needed to provide you services. We may also retain your
              information as necessary to comply with legal obligations, resolve
              disputes, and enforce our agreements. When your data is no longer
              needed, we will securely delete or anonymize it.
            </p>

            <h2>6. Your Rights</h2>

            <p>
              Depending on your location, you may have the following rights
              regarding your personal data:
            </p>
            <ul>
              <li>
                <strong>Access:</strong> Request a copy of the personal data we
                hold about you.
              </li>
              <li>
                <strong>Correction:</strong> Request correction of inaccurate or
                incomplete personal data.
              </li>
              <li>
                <strong>Deletion:</strong> Request deletion of your personal data,
                subject to certain legal exceptions.
              </li>
              <li>
                <strong>Data Portability:</strong> Request a copy of your data in
                a structured, machine-readable format.
              </li>
              <li>
                <strong>Opt-Out:</strong> Unsubscribe from promotional
                communications at any time using the unsubscribe link in our
                emails or by contacting us.
              </li>
              <li>
                <strong>Withdraw Consent:</strong> Where processing is based on
                your consent, you may withdraw it at any time.
              </li>
            </ul>

            <p>
              To exercise any of these rights, please contact us at{" "}
              <a href="mailto:support@flme.co">support@flme.co</a>. We will
              respond to your request within 30 days.
            </p>

            <h2>7. Children&apos;s Privacy</h2>

            <p>
              The Platform is not directed to children under 13 years of age. We
              do not knowingly collect personal information from children under
              13. If you are a parent or guardian and believe your child has
              provided us with personal information, please contact us at{" "}
              <a href="mailto:support@flme.co">support@flme.co</a>, and we will
              take steps to delete such information.
            </p>

            <h2>8. Security</h2>

            <p>
              We implement appropriate technical and organizational security
              measures to protect your personal data against unauthorized access,
              alteration, disclosure, or destruction. These include encryption of
              data in transit (HTTPS/TLS), secure authentication through Clerk,
              and PCI-DSS-compliant payment processing through Stripe. However,
              no method of transmission over the Internet or method of electronic
              storage is 100% secure, and we cannot guarantee absolute security.
            </p>

            <h2>9. Incident Notification</h2>

            <p>
              In the event of a data breach that is likely to result in a risk to
              your rights and freedoms, we will notify affected users and
              applicable regulatory authorities without undue delay, in
              accordance with applicable law.
            </p>

            <h2>10. Changes to This Policy</h2>

            <p>
              We may update this Privacy Policy from time to time. If we make
              material changes, we will notify you by posting the updated policy
              on the Platform with a revised &quot;Last Updated&quot; date. Your continued
              use of the Platform after such changes constitutes your acceptance
              of the updated Privacy Policy.
            </p>

            <h2>11. Contact Us</h2>

            <p>
              If you have questions about this Privacy Policy, wish to exercise
              your data rights, or have concerns about how your data is being
              handled, please contact us:
            </p>
            <ul>
              <li><strong>Email:</strong> <a href="mailto:support@flme.co">support@flme.co</a></li>
            </ul>
            <p>
              FLAME LLC<br />
              United States of America
            </p>
          </div>

          {/* Divider between languages */}
          <div className="border-t border-white-20 mb-16" />

          {/* Spanish Section */}
          <div id="spanish" className={`scroll-mt-20 ${proseClasses}`}>
            <h1>POLÍTICA DE PRIVACIDAD</h1>
            <p>
              <strong>Última actualización: 31 de marzo de 2026</strong>
            </p>

            <p>
              FLAME LLC (&quot;FLAME,&quot; &quot;nosotros&quot; o &quot;nuestro&quot;) se compromete a proteger
              la privacidad de nuestros usuarios. Esta Política de Privacidad
              explica cómo recopilamos, usamos, divulgamos y protegemos su
              información cuando utiliza nuestra aplicación móvil y sitio web
              (colectivamente, la &quot;Plataforma&quot;). Por favor lea esta política
              cuidadosamente. Al usar la Plataforma, usted consiente las
              prácticas aquí descritas.
            </p>

            <h2>1. Información que recopilamos</h2>

            <h3>Información personal que usted proporciona</h3>
            <p>
              Cuando se registra para una cuenta, realiza una compra o nos
              contacta, podemos recopilar la siguiente información:
            </p>
            <ul>
              <li>Nombre completo</li>
              <li>Dirección de correo electrónico</li>
              <li>Información de perfil (foto, preferencias)</li>
              <li>Historial de asistencia a eventos y compras</li>
            </ul>

            <h3>Información recopilada automáticamente</h3>
            <p>
              Cuando accede a nuestra Plataforma, podemos recopilar
              automáticamente cierta información, incluyendo:
            </p>
            <ul>
              <li>Información del dispositivo (tipo, sistema operativo, identificadores únicos)</li>
              <li>Dirección IP y ubicación aproximada</li>
              <li>Tipo y versión del navegador</li>
              <li>Datos de uso (páginas visitadas, funciones utilizadas, tiempo de uso)</li>
              <li>Cookies y tecnologías de seguimiento similares (consulte nuestra <a href="/cookie-settings">Política de Cookies</a>)</li>
            </ul>

            <h3>Información de pago</h3>
            <p>
              El procesamiento de pagos es manejado por nuestro procesador de pagos
              externo, Stripe, Inc. FLAME no almacena, recopila ni tiene acceso a
              sus números completos de tarjeta de crédito o débito. Stripe procesa
              su información de pago de acuerdo con los estándares PCI-DSS.
              Consulte la{" "}
              <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">
                Política de Privacidad de Stripe
              </a>{" "}
              para obtener detalles sobre cómo manejan sus datos de pago.
            </p>

            <h2>2. Cómo usamos su información</h2>

            <p>Usamos la información que recopilamos para:</p>
            <ul>
              <li>Procesar compras de boletos y entregar boletos digitales</li>
              <li>Crear y gestionar su cuenta</li>
              <li>Enviar confirmaciones de pedidos, actualizaciones de eventos y comunicaciones de soporte</li>
              <li>Enviar notificaciones promocionales sobre eventos (con su consentimiento)</li>
              <li>Mejorar y personalizar nuestra Plataforma y servicios</li>
              <li>Detectar y prevenir fraude, abuso e incidentes de seguridad</li>
              <li>Cumplir con obligaciones legales</li>
            </ul>

            <h2>3. Servicios de terceros y compartición de datos</h2>

            <p>
              Compartimos su información con los siguientes proveedores de
              servicios externos que nos ayudan a operar la Plataforma:
            </p>
            <ul>
              <li>
                <strong>Stripe, Inc.</strong> — Procesamiento de pagos. Stripe
                recibe sus datos de pago para procesar transacciones de forma
                segura.
              </li>
              <li>
                <strong>Clerk</strong> — Autenticación y gestión de cuentas.
                Clerk maneja sus credenciales de inicio de sesión y gestión de
                sesiones.
              </li>
              <li>
                <strong>Supabase</strong> — Base de datos y servicios backend. Sus
                datos de perfil, datos de eventos e historial de compras se
                almacenan de forma segura en la infraestructura de Supabase.
              </li>
              <li>
                <strong>Brevo</strong> — Entrega de correos electrónicos
                transaccionales. Brevo recibe su dirección de correo electrónico
                para enviar confirmaciones de pedidos, actualizaciones de eventos
                y otros correos relacionados con el servicio.
              </li>
              <li>
                <strong>Expo (Expo Application Services)</strong> — Entrega de
                notificaciones push. Si activa las notificaciones push en la
                aplicación móvil, un token de dispositivo se transmite al
                servicio de notificaciones de Expo para enviar recordatorios de
                eventos, actualizaciones de RSVP y confirmaciones de entradas.
              </li>
              <li>
                <strong>Google Places API</strong> — Autocompletado de ciudades.
                Cuando los organizadores buscan una ciudad al crear o editar un
                evento, el texto ingresado se envía a la API de Google Places
                para proporcionar sugerencias de ubicación. No se transmite
                información personal.
              </li>
            </ul>

            <p>
              También podemos compartir información con{" "}
              <strong>Organizadores de Eventos</strong> que necesitan información
              de asistentes para los eventos a los que usted se registra o compra
              boletos (por ejemplo, nombre y detalles del boleto para fines de
              registro de entrada).
            </p>

            <p>
              No vendemos su información personal a terceros.
            </p>

            <h2>4. Transferencias internacionales de datos</h2>

            <p>
              FLAME LLC tiene su sede en los Estados Unidos. Si accede a la
              Plataforma desde fuera de los Estados Unidos, tenga en cuenta que
              su información puede ser transferida, almacenada y procesada en
              los Estados Unidos y otros países donde operan nuestros
              proveedores de servicios. Al usar la Plataforma, usted consiente
              la transferencia de su información a estos países, que pueden tener
              leyes de protección de datos diferentes a las de su país.
            </p>

            <h2>5. Retención de datos</h2>

            <p>
              Retenemos su información personal mientras su cuenta esté activa o
              según sea necesario para proporcionarle servicios. También podemos
              retener su información según sea necesario para cumplir con
              obligaciones legales, resolver disputas y hacer cumplir nuestros
              acuerdos. Cuando sus datos ya no sean necesarios, los eliminaremos
              o anonimizaremos de forma segura.
            </p>

            <h2>6. Sus derechos</h2>

            <p>
              Dependiendo de su ubicación, puede tener los siguientes derechos
              respecto a sus datos personales:
            </p>
            <ul>
              <li>
                <strong>Acceso:</strong> Solicitar una copia de los datos
                personales que tenemos sobre usted.
              </li>
              <li>
                <strong>Corrección:</strong> Solicitar la corrección de datos
                personales inexactos o incompletos.
              </li>
              <li>
                <strong>Eliminación:</strong> Solicitar la eliminación de sus
                datos personales, sujeto a ciertas excepciones legales.
              </li>
              <li>
                <strong>Portabilidad de datos:</strong> Solicitar una copia de sus
                datos en un formato estructurado y legible por máquina.
              </li>
              <li>
                <strong>Exclusión voluntaria:</strong> Darse de baja de las
                comunicaciones promocionales en cualquier momento utilizando el
                enlace de cancelación en nuestros correos o contactándonos.
              </li>
              <li>
                <strong>Retirar consentimiento:</strong> Cuando el procesamiento
                se base en su consentimiento, puede retirarlo en cualquier
                momento.
              </li>
            </ul>

            <p>
              Para ejercer cualquiera de estos derechos, contáctenos en{" "}
              <a href="mailto:support@flme.co">support@flme.co</a>. Responderemos
              a su solicitud dentro de 30 días.
            </p>

            <h2>7. Privacidad de menores</h2>

            <p>
              La Plataforma no está dirigida a menores de 13 años. No recopilamos
              intencionalmente información personal de menores de 13 años. Si
              usted es padre o tutor y cree que su hijo nos ha proporcionado
              información personal, contáctenos en{" "}
              <a href="mailto:support@flme.co">support@flme.co</a> y tomaremos
              medidas para eliminar dicha información.
            </p>

            <h2>8. Seguridad</h2>

            <p>
              Implementamos medidas de seguridad técnicas y organizativas
              apropiadas para proteger sus datos personales contra el acceso no
              autorizado, alteración, divulgación o destrucción. Estas incluyen
              cifrado de datos en tránsito (HTTPS/TLS), autenticación segura a
              través de Clerk y procesamiento de pagos compatible con PCI-DSS a
              través de Stripe. Sin embargo, ningún método de transmisión por
              Internet o almacenamiento electrónico es 100% seguro, y no podemos
              garantizar seguridad absoluta.
            </p>

            <h2>9. Notificación de incidentes</h2>

            <p>
              En caso de una violación de datos que probablemente resulte en un
              riesgo para sus derechos y libertades, notificaremos a los usuarios
              afectados y a las autoridades reguladoras aplicables sin demora
              indebida, de acuerdo con la ley aplicable.
            </p>

            <h2>10. Cambios a esta política</h2>

            <p>
              Podemos actualizar esta Política de Privacidad periódicamente. Si
              realizamos cambios sustanciales, le notificaremos publicando la
              política actualizada en la Plataforma con una fecha de &quot;Última
              actualización&quot; revisada. Su uso continuado de la Plataforma después
              de dichos cambios constituye su aceptación de la Política de
              Privacidad actualizada.
            </p>

            <h2>11. Contáctenos</h2>

            <p>
              Si tiene preguntas sobre esta Política de Privacidad, desea
              ejercer sus derechos sobre sus datos o tiene inquietudes sobre cómo
              se manejan sus datos, contáctenos:
            </p>
            <ul>
              <li><strong>Correo electrónico:</strong> <a href="mailto:support@flme.co">support@flme.co</a></li>
            </ul>
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
