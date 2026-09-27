;;; organice-themes.el --- ORGanice: temas Unicornio y Cuki (claro y oscuro)  -*- lexical-binding: t; -*-

;; Los mismos colores que los temas de la app (src/lib/color.js):
;;   M-x organice-theme  →  unicornio, unicornio-oscuro, cuki, cuki-oscuro
;; Los encabezados usan azul, verde, cian y amarillo por niveles, como la app; los estados
;; (TODO, NEXT…) naranja y los terminados verde.

(require 'cl-lib)

(defvar organice-theme-palettes
  '((unicornio
     :base3 "#fcf8fd" :base2 "#f2e9f8" :base1 "#c9b8dc" :base0 "#9d8bb3"
     :base00 "#6b5d80" :base01 "#5a4870" :base02 "#4a3a5e" :base03 "#3f3252"
     :blue "#6d52b8" :green "#2f8c6c" :cyan "#b84a8a" :yellow "#b77a16"
     :orange "#d2447f" :red "#c8374f" :magenta "#7c5cd6" :violet "#b06fc4" :dark nil)
    (unicornio-oscuro
     :base3 "#1e1929" :base2 "#2a2239" :base1 "#3b3152" :base0 "#4b4066"
     :base00 "#cdc2e2" :base01 "#dcd2ee" :base02 "#eae3f6" :base03 "#f6f1fd"
     :blue "#9a80ec" :green "#7fd4b4" :cyan "#f59fc4" :yellow "#f2c46a"
     :orange "#f47fb1" :red "#ff7a90" :magenta "#8a6be6" :violet "#e3a6f0" :dark t)
    (cuki
     :base3 "#f7fbfb" :base2 "#e2efef" :base1 "#b5cece" :base0 "#8ca7a8"
     :base00 "#5c7273" :base01 "#485e5f" :base02 "#344748" :base03 "#253536"
     :blue "#2f878d" :green "#4f9478" :cyan "#c0677a" :yellow "#a07f4c"
     :orange "#d8677a" :red "#c24d60" :magenta "#d77889" :violet "#7e78ad" :dark nil)
    (cuki-oscuro
     :base3 "#15232a" :base2 "#1e3139" :base1 "#2c454d" :base0 "#3a565e"
     :base00 "#c2d5d6" :base01 "#d2e2e3" :base02 "#e2eded" :base03 "#f2f8f8"
     :blue "#4fb0b6" :green "#8fd0b0" :cyan "#f2b3bd" :yellow "#e6cf9c"
     :orange "#f5949f" :red "#ff8795" :magenta "#d9788a" :violet "#b7ace0" :dark t))
  "Colores de los temas de ORGanice (fondos base3…base0; textos base00…base03).")

(defun organice--theme-faces (p)
  "Lista de caras para la paleta P."
  (cl-flet ((c (k) (plist-get p k)))
    `((default ((t (:background ,(c :base3) :foreground ,(c :base01)))))
      (cursor ((t (:background ,(c :blue)))))
      (fringe ((t (:background ,(c :base3)))))
      (region ((t (:background ,(c :base2) :extend t))))
      (highlight ((t (:background ,(c :base2)))))
      (hl-line ((t (:background ,(c :base2) :extend t))))
      (shadow ((t (:foreground ,(c :base0)))))
      (link ((t (:foreground ,(c :blue) :underline t))))
      (minibuffer-prompt ((t (:foreground ,(c :blue) :weight bold))))
      (mode-line ((t (:background ,(c :base2) :foreground ,(c :base01) :box (:line-width 4 :color ,(c :base2))))))
      (mode-line-inactive ((t (:background ,(c :base3) :foreground ,(c :base0) :box (:line-width 4 :color ,(c :base3))))))
      (header-line ((t (:background ,(c :base2) :foreground ,(c :base01)))))
      (vertical-border ((t (:foreground ,(c :base1)))))
      (isearch ((t (:background ,(c :magenta) :foreground ,(c :base3)))))
      (lazy-highlight ((t (:background ,(c :base1)))))
      (font-lock-comment-face ((t (:foreground ,(c :base0) :slant italic))))
      (font-lock-keyword-face ((t (:foreground ,(c :blue)))))
      (font-lock-string-face ((t (:foreground ,(c :green)))))
      (font-lock-function-name-face ((t (:foreground ,(c :cyan)))))
      (font-lock-variable-name-face ((t (:foreground ,(c :violet)))))
      (font-lock-constant-face ((t (:foreground ,(c :magenta)))))
      (font-lock-type-face ((t (:foreground ,(c :yellow)))))
      (error ((t (:foreground ,(c :red) :weight bold))))
      (warning ((t (:foreground ,(c :orange) :weight bold))))
      (success ((t (:foreground ,(c :green) :weight bold))))
      ;; Org: encabezados por niveles como la app (azul, verde, cian, amarillo…)
      (org-level-1 ((t (:foreground ,(c :blue) :weight bold :height 1.1))))
      (org-level-2 ((t (:foreground ,(c :green) :weight bold))))
      (org-level-3 ((t (:foreground ,(c :cyan)))))
      (org-level-4 ((t (:foreground ,(c :yellow)))))
      (org-level-5 ((t (:foreground ,(c :blue)))))
      (org-level-6 ((t (:foreground ,(c :green)))))
      (org-level-7 ((t (:foreground ,(c :cyan)))))
      (org-level-8 ((t (:foreground ,(c :yellow)))))
      (org-todo ((t (:foreground ,(c :orange) :weight bold))))
      (org-done ((t (:foreground ,(c :green) :weight bold))))
      (org-headline-done ((t (:foreground ,(c :base0)))))
      (org-priority ((t (:foreground ,(c :yellow) :weight bold))))
      (org-tag ((t (:foreground ,(c :cyan) :weight normal))))
      (org-date ((t (:foreground ,(c :violet) :underline t))))
      (org-special-keyword ((t (:foreground ,(c :base0)))))
      (org-drawer ((t (:foreground ,(c :base0)))))
      (org-property-value ((t (:foreground ,(c :base00)))))
      (org-meta-line ((t (:foreground ,(c :base0)))))
      (org-document-title ((t (:foreground ,(c :blue) :weight bold :height 1.3))))
      (org-block ((t (:background ,(c :base2) :extend t))))
      (org-code ((t (:foreground ,(c :magenta)))))
      (org-verbatim ((t (:foreground ,(c :violet)))))
      (org-checkbox ((t (:foreground ,(c :blue) :weight bold))))
      (org-link ((t (:foreground ,(c :blue) :underline t))))
      (org-ellipsis ((t (:foreground ,(c :base0) :underline nil))))
      (org-scheduled ((t (:foreground ,(c :base01)))))
      (org-scheduled-today ((t (:foreground ,(c :blue) :weight bold))))
      (org-scheduled-previously ((t (:foreground ,(c :orange)))))
      (org-upcoming-deadline ((t (:foreground ,(c :orange)))))
      (org-warning ((t (:foreground ,(c :red) :weight bold))))
      (org-agenda-structure ((t (:foreground ,(c :blue) :weight bold :height 1.2))))
      (org-agenda-date ((t (:foreground ,(c :base01) :weight bold))))
      (org-agenda-date-today ((t (:foreground ,(c :blue) :weight bold :height 1.1))))
      (org-agenda-date-weekend ((t (:foreground ,(c :base00) :weight bold))))
      (org-agenda-done ((t (:foreground ,(c :base0)))))
      (org-super-agenda-header ((t (:foreground ,(c :magenta) :weight bold))))
      (org-habit-clear-face ((t (:background ,(c :base1)))))
      (org-habit-clear-future-face ((t (:background ,(c :base2)))))
      (org-habit-ready-face ((t (:background ,(c :green)))))
      (org-habit-ready-future-face ((t (:background ,(c :green)))))
      (org-habit-alert-face ((t (:background ,(c :yellow)))))
      (org-habit-alert-future-face ((t (:background ,(c :yellow)))))
      (org-habit-overdue-face ((t (:background ,(c :red)))))
      (org-habit-overdue-future-face ((t (:background ,(c :red))))))))

(defun organice--define-theme (name palette)
  (eval `(deftheme ,name ,(format "Tema %s de ORGanice." name)) t)
  (apply #'custom-theme-set-faces name (organice--theme-faces palette))
  (provide-theme name))

(dolist (entry organice-theme-palettes)
  (organice--define-theme (car entry) (cdr entry)))

(defcustom organice-default-theme 'unicornio
  "Tema al arrancar (unicornio, unicornio-oscuro, cuki, cuki-oscuro) o nil para no cambiarlo."
  :type 'symbol :group 'organice)

(defun organice-theme (name)
  "Cambia al tema NAME de ORGanice."
  (interactive
   (list (intern (completing-read "Tema: " (mapcar (lambda (e) (symbol-name (car e)))
                                                    organice-theme-palettes)
                                  nil t))))
  (mapc #'disable-theme custom-enabled-themes)
  (enable-theme name)
  (let ((p (cdr (assq name organice-theme-palettes))))
    (setq org-todo-keyword-faces
          `(("NEXT" . (:foreground ,(plist-get p :orange) :weight bold))
            ("TODO" . (:foreground ,(plist-get p :orange) :weight bold))
            ("WAITING" . (:foreground ,(plist-get p :yellow) :weight bold))
            ("MAYBE" . (:foreground ,(plist-get p :violet) :weight bold))
            ("PROJECT" . (:foreground ,(plist-get p :blue) :weight bold))
            ("DONE" . (:foreground ,(plist-get p :green) :weight bold))
            ("CANCELLED" . (:foreground ,(plist-get p :base0) :weight bold :strike-through t))))))

(when organice-default-theme
  (add-hook 'emacs-startup-hook (lambda () (organice-theme organice-default-theme))))

(provide 'organice-themes)
;;; organice-themes.el ends here
