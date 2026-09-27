;;; organice-capture.el --- ORGanice: capturar como en la app  -*- lexical-binding: t; -*-

;; C-c c (o la tecla c de la app) → letra de la plantilla.
;; Cambia o añade plantillas aquí para que coincidan con las tuyas de la app
;; (Ajustes → Plantillas de captura): misma letra, mismo fichero y mismo texto.

(require 'org-capture)
(require 'organice-core)

(setq org-capture-templates
      `(("i" "Inbox (entrada)" entry
         (file ,(organice-inbox-path))
         "* %?\n%U\n" :empty-lines 0 :prepend nil)
        ("t" "Tarea (TODO)" entry
         (file ,(organice-tasks-path))
         "* TODO %?\n" :empty-lines 0)
        ("n" "Siguiente acción (NEXT)" entry
         (file ,(organice-tasks-path))
         "* NEXT %?\n" :empty-lines 0)
        ("p" "Proyecto" entry
         (file ,(organice-tasks-path))
         "* PROJECT %?\n** NEXT \n" :empty-lines 0)
        ("h" "Hábito" entry
         (file ,(organice-tasks-path))
         "* TODO %?\nSCHEDULED: %(org-insert-time-stamp (current-time) nil nil nil nil \" .+1d\")\n:PROPERTIES:\n:STYLE: habit\n:END:\n"
         :empty-lines 0)
        ("l" "Nota con enlace a lo que estaba viendo" entry
         (file ,(organice-inbox-path))
         "* %?\n%U\n%a\n" :empty-lines 0)))

;; Tras capturar, guardar (Dropbox lo sube) como hace la app
(add-hook 'org-capture-after-finalize-hook #'org-save-all-org-buffers)

(provide 'organice-capture)
;;; organice-capture.el ends here
