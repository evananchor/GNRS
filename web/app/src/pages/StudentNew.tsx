import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { createStudent } from '@/api/students'
import { PageShell } from '@/components/PageShell'
import { StudentForm } from '@/components/StudentForm'

export function NewStudentPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: createStudent,
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ['students'] })
      navigate(`/students/${created.id}`)
    },
  })

  return (
    <PageShell header={<h1 className="text-2xl font-semibold">{t('students.add')}</h1>}>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <StudentForm
          submitLabel={t('common.save')}
          pending={mutation.isPending}
          error={mutation.error}
          onSubmit={(input) => mutation.mutate(input)}
          onCancel={() => navigate('/students')}
        />
      </div>
    </PageShell>
  )
}
