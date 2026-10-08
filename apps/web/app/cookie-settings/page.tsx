import { Navbar, Footer } from "../components";
import Link from "next/link";

const proseClasses =
  "[&_h1]:text-2xl [&_h1]:leading-8 [&_h1]:font-poppins-semibold [&_h1]:text-white-100 [&_h1]:mb-6 " +
  "[&_h2]:text-lg [&_h2]:font-poppins-semibold [&_h2]:text-white-100 [&_h2]:mt-8 [&_h2]:mb-3 " +
  "[&_h3]:text-base [&_h3]:font-poppins-semibold [&_h3]:text-white-100 [&_h3]:mt-6 [&_h3]:mb-2 " +
  "[&_p]:text-sm [&_p]:leading-[22px] [&_p]:font-poppins [&_p]:text-white-80 [&_p]:mb-3 " +
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 " +
  "[&_li]:text-sm [&_li]:leading-[22px] [&_li]:font-poppins [&_li]:text-white-80 [&_li]:mb-1 " +
  "[&_strong]:text-white-100 [&_strong]:font-poppins-semibold " +
  "[&_a]:text-white-100 [&_a]:underline [&_a]:transition-colors";

export default function CookieSettingsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <div className="flex-1 pt-16">
        <div className="max-w-[800px] mx-auto px-4 py-12">
          {/* Language Toggle */}
          <div className="flex items-center gap-3 mb-10 pb-6 border-b border-white-20">
            <a
              href="#english"
              className="text-sm font-poppins-medium px-4 py-2 rounded-pill bg-white-100 text-dark transition-colors"
            >
              Read in English
            </a>
            <span className="text-white-30 font-poppins text-sm">|</span>
            <a
              href="#spanish"
              className="text-sm font-poppins-medium px-4 py-2 rounded-pill text-white-50 hover:text-white-100 transition-colors"
            >
              Leer en Español
            </a>
          </div>

          {/* English Section */}
          <div id="english" className={`mb-16 scroll-mt-20 ${proseClasses}`}>
            <h1>Cookie Policy</h1>
            <p>
              <strong>Last Updated: March 31, 2026</strong>
            </p>

            <h2>What Are Cookies?</h2>
            <p>
              Cookies are small text files stored on your device when you visit
              our website or use our application. They help us remember your
              preferences, keep you logged in, and improve your experience.
            </p>

            <h2>How We Use Cookies</h2>
            <p>
              At FLAME, we use cookies to provide you with essential services,
              personalize your experience, and ensure the security of your
              account. Below is a detailed breakdown of the cookies we use:
            </p>

            <h3>1. Essential Cookies (Required)</h3>
            <p>
              These cookies are necessary for the basic functioning of our
              platform. They are not optional and cannot be disabled.
            </p>
            <ul>
              <li>
                <strong>Clerk Authentication Cookies</strong> — Used for user
                login and session management. These cookies maintain your
                authenticated session so you can access your account securely.
              </li>
              <li>
                <strong>Supabase Session Cookies</strong> — Used to manage your
                database session and retrieve your profile data, event
                information, and purchase history.
              </li>
              <li>
                <strong>Session Storage (Purchase Flow)</strong> — Temporary
                storage used during the ticket purchase process to save your
                billing information, selected tickets, and promo codes. This data
                is automatically cleared when you complete your purchase or close
                the browser.
              </li>
            </ul>

            <h3>2. Functional Cookies (Performance)</h3>
            <p>
              These cookies enhance the functionality and performance of our
              platform.
            </p>
            <ul>
              <li>
                <strong>React Query Cache Cookies</strong> — Used to cache API
                responses and improve page load times. This helps us serve you
                data faster and reduce server load.
              </li>
            </ul>

            <h3>3. Third-Party Service Cookies</h3>
            <p>
              Our platform integrates with third-party services that may set their
              own cookies:
            </p>
            <ul>
              <li>
                <strong>Stripe Payment Processing</strong> — When you process a
                payment on our platform, Stripe may set cookies to securely
                handle your payment information, prevent fraud, and comply with
                financial regulations.
              </li>
              <li>
                <strong>Brevo Email Service</strong> — When we send you
                transactional emails (order confirmations, event updates, etc.),
                Brevo may use tracking pixels or cookies to monitor email delivery
                and opens.
              </li>
            </ul>

            <h2>Your Cookie Preferences</h2>
            <p>
              Most web browsers allow you to control cookies through their
              settings. You can:
            </p>
            <ul>
              <li>View what cookies are stored on your device</li>
              <li>Delete cookies from your browser</li>
              <li>Block certain types of cookies</li>
              <li>Set your browser to notify you when a cookie is being set</li>
            </ul>

            <p>
              <strong>Important:</strong> If you disable essential cookies, you
              may not be able to log in or purchase tickets on our platform.
            </p>

            <h2>Data Security</h2>
            <p>
              All cookies that contain sensitive information are transmitted via
              secure HTTPS connections and are protected according to our{" "}
              <Link href="/privacy-policy">Privacy Policy</Link>. We do not sell
              your cookie data to third parties.
            </p>

            <h2>Changes to This Policy</h2>
            <p>
              We may update this Cookie Policy from time to time to reflect
              changes in our practices or for other operational, legal, or
              regulatory reasons. Your continued use of our platform after such
              modifications constitutes your acceptance of the updated Cookie
              Policy.
            </p>

            <h2>Contact Us</h2>
            <p>
              If you have questions about our Cookie Policy or how we use cookies,
              please contact us at{" "}
              <a href="mailto:support@flme.co">support@flme.co</a> or through our{" "}
              <Link href="/contact">contact page</Link>.
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
            <h1>Política de Cookies</h1>
            <p>
              <strong>Última actualización: 31 de marzo de 2026</strong>
            </p>

            <h2>¿Qué son las Cookies?</h2>
            <p>
              Las cookies son pequeños archivos de texto que se almacenan en tu
              dispositivo cuando visitas nuestro sitio web o utilizas nuestra
              aplicación. Nos ayudan a recordar tus preferencias, mantener tu
              sesión iniciada y mejorar tu experiencia.
            </p>

            <h2>Cómo Utilizamos las Cookies</h2>
            <p>
              En FLAME, utilizamos cookies para proporcionarte servicios
              esenciales, personalizar tu experiencia y garantizar la seguridad de
              tu cuenta. A continuación, se detalla cómo utilizamos las cookies:
            </p>

            <h3>1. Cookies Esenciales (Requeridas)</h3>
            <p>
              Estas cookies son necesarias para el funcionamiento básico de
              nuestra plataforma. No son opcionales y no pueden desactivarse.
            </p>
            <ul>
              <li>
                <strong>Cookies de Autenticación de Clerk</strong> — Se utilizan
                para el inicio de sesión del usuario y la gestión de sesiones.
                Estas cookies mantienen tu sesión autenticada para que puedas
                acceder a tu cuenta de forma segura.
              </li>
              <li>
                <strong>Cookies de Sesión de Supabase</strong> — Se utilizan para
                gestionar tu sesión de base de datos y recuperar la información de
                tu perfil, eventos e historial de compras.
              </li>
              <li>
                <strong>Almacenamiento de Sesión (Flujo de Compra)</strong> —
                Almacenamiento temporal utilizado durante el proceso de compra de
                entradas para guardar tu información de facturación, entradas
                seleccionadas y códigos promocionales. Estos datos se borran
                automáticamente cuando completas tu compra o cierras el navegador.
              </li>
            </ul>

            <h3>2. Cookies Funcionales (Rendimiento)</h3>
            <p>
              Estas cookies mejoran la funcionalidad y el rendimiento de nuestra
              plataforma.
            </p>
            <ul>
              <li>
                <strong>Cookies de Caché de React Query</strong> — Se utilizan
                para almacenar en caché las respuestas de la API y mejorar los
                tiempos de carga de la página. Esto nos ayuda a servir datos más
                rápidamente y reduce la carga del servidor.
              </li>
            </ul>

            <h3>3. Cookies de Servicios Terceros</h3>
            <p>
              Nuestra plataforma se integra con servicios de terceros que pueden
              establecer sus propias cookies:
            </p>
            <ul>
              <li>
                <strong>Procesamiento de Pagos Stripe</strong> — Cuando procesas
                un pago en nuestra plataforma, Stripe puede establecer cookies
                para manejar de forma segura tu información de pago, prevenir
                fraudes y cumplir con las regulaciones financieras.
              </li>
              <li>
                <strong>Servicio de Correo Brevo</strong> — Cuando te enviamos
                correos electrónicos transaccionales (confirmaciones de pedidos,
                actualizaciones de eventos, etc.), Brevo puede utilizar píxeles de
                seguimiento o cookies para monitorear la entrega y apertura de
                correos.
              </li>
            </ul>

            <h2>Tus Preferencias de Cookies</h2>
            <p>
              La mayoría de los navegadores web te permiten controlar las cookies
              a través de su configuración. Puedes:
            </p>
            <ul>
              <li>Ver qué cookies se almacenan en tu dispositivo</li>
              <li>Eliminar cookies de tu navegador</li>
              <li>Bloquear ciertos tipos de cookies</li>
              <li>
                Configurar tu navegador para notificarte cuando se establezca una
                cookie
              </li>
            </ul>

            <p>
              <strong>Importante:</strong> Si desactivas las cookies esenciales,
              es posible que no puedas iniciar sesión ni comprar entradas en
              nuestra plataforma.
            </p>

            <h2>Seguridad de los Datos</h2>
            <p>
              Todas las cookies que contienen información sensible se transmiten a
              través de conexiones HTTPS seguras y están protegidas de acuerdo con
              nuestra{" "}
              <Link href="/privacy-policy">Política de Privacidad</Link>. No
              vendemos tus datos de cookies a terceros.
            </p>

            <h2>Cambios en Esta Política</h2>
            <p>
              Podemos actualizar esta Política de Cookies de vez en cuando para
              reflejar cambios en nuestras prácticas o por otras razones
              operativas, legales o regulatorias. Tu uso continuado de nuestra
              plataforma después de tales modificaciones constituye tu aceptación
              de la Política de Cookies actualizada.
            </p>

            <h2>Contáctanos</h2>
            <p>
              Si tienes preguntas sobre nuestra Política de Cookies o cómo
              utilizamos las cookies, contáctanos en{" "}
              <a href="mailto:support@flme.co">support@flme.co</a> o a través de
              nuestra{" "}
              <Link href="/contact">página de contacto</Link>.
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
