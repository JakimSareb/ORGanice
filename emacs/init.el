;;; init.el --- ORGanice para Emacs: configuración limpia  -*- lexical-binding: t; -*-

;; Réplica en Emacs del sistema de ORGanice (la app de Org Mode sobre Dropbox):
;; mismos ficheros, estados, etiquetas, propiedades, capturas, archivo y vistas GTD.
;;
;; Requiere Emacs 29 o posterior. Para probarla SIN tocar tu configuración actual:
;;     emacs --init-directory ~/organice-emacs
;; (ver README.org).

;;;; Ajustes personales ------------------------------------------------------------------
;; Lo único que normalmente hay que tocar. Si lo dejas en nil, se busca solo la carpeta de
;; ORGanice en Dropbox (Aplicaciones/ORGanice, Apps/ORGanice…).
(defvar organice-directory-override nil
  "Carpeta de tus ficheros .org (la misma que usa la app). nil = buscarla sola.")

;;;; Paquetes -----------------------------------------------------------------------------
(require 'package)
(setq package-archives
      '(("gnu"    . "https://elpa.gnu.org/packages/")
        ("nongnu" . "https://elpa.nongnu.org/nongnu/")
        ("melpa"  . "https://melpa.org/packages/")))
(package-initialize)

(require 'use-package)
(setq use-package-always-ensure t)   ; instala lo que falte la primera vez (hace falta internet)

;; Configuración generada por Emacs (M-x customize) fuera de init.el
(setq custom-file (locate-user-emacs-file "custom.el"))
(when (file-exists-p custom-file) (load custom-file nil t))

;;;; Básicos ------------------------------------------------------------------------------
(setq-default indent-tabs-mode nil
              fill-column 100)
(setq ring-bell-function #'ignore
      use-short-answers t
      make-backup-files nil        ; la app ya hace copias en la carpeta backups/
      create-lockfiles nil         ; los ficheros .#… molestan en Dropbox
      auto-save-default nil
      sentence-end-double-space nil)
(set-language-environment "UTF-8")
(prefer-coding-system 'utf-8)
(savehist-mode 1)          ; historial (la paleta recuerda lo último usado)
(recentf-mode 1)
(save-place-mode 1)
(delete-selection-mode 1)
(when (fboundp 'pixel-scroll-precision-mode) (pixel-scroll-precision-mode 1))

;; Sincronización con Dropbox: guardar solo y releer lo que cambie fuera (la app, el móvil…)
(setq auto-save-visited-interval 5)
(auto-save-visited-mode 1)
(setq global-auto-revert-non-file-buffers t
      auto-revert-verbose nil)
(global-auto-revert-mode 1)

;;;; Módulos de ORGanice ------------------------------------------------------------------
(add-to-list 'load-path (expand-file-name "lisp" user-emacs-directory))
(require 'organice-core)      ; Org: carpeta, estados, etiquetas, propiedades, archivo, cifrado
(require 'organice-gtd)       ; vistas GTD como en la app (Focus, Inbox, Next…), ★ automática
(require 'organice-capture)   ; plantillas de captura
(require 'organice-attach)    ; adjuntos: adjuntar, abrir, borrar, clip 📎 y revisar terminadas
(require 'organice-calendar)  ; calendario: español, lunes primero, semanas, festivos, Luna
(require 'organice-themes)    ; temas Unicornio y Cuki (claro y oscuro)
(require 'organice-ui)        ; paleta de comandos, atajos, formato, modos Documentos/GTD

;;; init.el ends here
