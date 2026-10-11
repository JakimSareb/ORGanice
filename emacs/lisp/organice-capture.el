;;; organice-capture.el --- ORGanice: capturar como en la app  -*- lexical-binding: t; -*-

;; C-c c (o la tecla c de la app) → letra de la plantilla.
;; Cambia o añade plantillas aquí para que coincidan con las tuyas de la app
;; (Ajustes → Plantillas de captura): misma letra, mismo fichero y mismo texto.
;; (2.17) Las tareas nuevas llevan «:Created: [fecha]», como las de la vista GTD de la app.

(require 'org-capture)
(require 'organice-core)

(setq org-capture-templates
      `(("i" "Inbox (entrada)" entry
         (file ,(organice-inbox-path))
         "* %?\n:Created: %U\n" :empty-lines 0 :prepend nil)
        ("t" "Tarea (TODO)" entry
         (file ,(organice-tasks-path))
         "* TODO %?\n:Created: %U\n" :empty-lines 0)
        ("n" "Siguiente acción (NEXT)" entry
         (file ,(organice-tasks-path))
         "* NEXT %?\n:Created: %U\n" :empty-lines 0)
        ("p" "Proyecto" entry
         (file ,(organice-tasks-path))
         "* PROJECT %?\n:Created: %U\n** NEXT \n" :empty-lines 0)
        ("h" "Hábito" entry
         (file ,(organice-tasks-path))
         "* TODO %?\nSCHEDULED: %(org-insert-time-stamp (current-time) nil nil nil nil \" .+1d\")\n:PROPERTIES:\n:STYLE: habit\n:END:\n:Created: %U\n"
         :empty-lines 0)
        ("l" "Nota con enlace a lo que estaba viendo" entry
         (file ,(organice-inbox-path))
         "* %?\n:Created: %U\n%a\n" :empty-lines 0)))

;; Tras capturar, guardar (Dropbox lo sube) como hace la app
(add-hook 'org-capture-after-finalize-hook #'org-save-all-org-buffers)

(provide 'organice-capture)
;;; organice-capture.el ends here
