;;; early-init.el --- ORGanice para Emacs: arranque temprano  -*- lexical-binding: t; -*-

;; Se carga antes que init.el y que la interfaz gráfica.

;; Arranque más rápido: recolector de basura relajado mientras se carga todo
(setq gc-cons-threshold (* 64 1024 1024)
      gc-cons-percentage 0.6)
(add-hook 'emacs-startup-hook
          (lambda () (setq gc-cons-threshold (* 16 1024 1024)
                           gc-cons-percentage 0.1)))

;; Interfaz limpia (la app tampoco tiene barras)
(push '(menu-bar-lines . 0) default-frame-alist)
(push '(tool-bar-lines . 0) default-frame-alist)
(push '(vertical-scroll-bars) default-frame-alist)
(setq frame-inhibit-implied-resize t
      inhibit-startup-screen t)

;; Los paquetes se inicializan en init.el
(setq package-enable-at-startup nil)

;;; early-init.el ends here
