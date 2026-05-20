import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { createTeacher } from '@/api/teachers'
import { PageShell } from '@/components/PageShell'
import { TeacherForm } from '@/components/TeacherForm'

export function NewTeacherPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: createTeacher,
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ['teachers'] })
      navigate(`/teachers/${created.id}`)
    },
  })

  return (
    <PageShell header={<h1 className="text-2xl font-semibold">{t('teachers.add')}</h1>}>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <TeacherForm
          submitLabel={t('common.save')}
          pending={mutation.isPending}
          error={mutation.error}
          onSubmit={(input) => mutation.mutate(input)}
          onCancel={() => navigate('/teachers')}
        />
      </div>
    </PageShell>
  )
}
