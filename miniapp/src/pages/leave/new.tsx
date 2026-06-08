import { useState } from 'react'
import { View, Text, Textarea, Picker, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { submitLeaveFile } from '@/api/endpoints'

const TYPES = ['事假', '公假']

function today() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function LeaveNew() {
  const [typeIdx, setTypeIdx] = useState(0)
  const [start, setStart] = useState(today())
  const [end, setEnd] = useState(today())
  const [returnDate, setReturnDate] = useState('')
  const [reason, setReason] = useState('')
  const [filePath, setFilePath] = useState('')
  const [busy, setBusy] = useState(false)

  const chooseFile = () => {
    Taro.showActionSheet({ itemList: ['从相册/拍照选图片', '选择聊天文件(PDF)'] }).then((r) => {
      if (r.tapIndex === 0) {
        Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
          .then((res) => setFilePath(res.tempFilePaths[0]))
      } else {
        Taro.chooseMessageFile({ count: 1, type: 'file', extension: ['pdf', 'jpg', 'jpeg', 'png'] })
          .then((res) => setFilePath(res.tempFiles[0].path))
          .catch(() => {})
      }
    })
  }

  const submit = async () => {
    if (end < start) { Taro.showToast({ title: '结束不能早于开始', icon: 'none' }); return }
    if (!reason.trim()) { Taro.showToast({ title: '请填写事由', icon: 'none' }); return }
    if (!filePath) { Taro.showToast({ title: '请上传证明材料', icon: 'none' }); return }
    setBusy(true)
    try {
      await submitLeaveFile(filePath, {
        type: TYPES[typeIdx], startDate: start, endDate: end, reason: reason.trim(),
        ...(returnDate ? { returnDate } : {}),
      })
      Taro.showToast({ title: '已提交，待核查', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 600)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '提交失败', icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <View className='card'>
      <Text className='label'>类型</Text>
      <Picker mode='selector' range={TYPES} value={typeIdx}
              onChange={(e) => setTypeIdx(Number(e.detail.value))}>
        <View className='input'>{TYPES[typeIdx]}</View>
      </Picker>

      <Text className='label' style={{ marginTop: '20rpx' }}>开始日期</Text>
      <Picker mode='date' value={start} onChange={(e) => setStart(e.detail.value)}>
        <View className='input'>{start}</View>
      </Picker>

      <Text className='label' style={{ marginTop: '20rpx' }}>结束日期</Text>
      <Picker mode='date' value={end} onChange={(e) => setEnd(e.detail.value)}>
        <View className='input'>{end}</View>
      </Picker>

      <Text className='label' style={{ marginTop: '20rpx' }}>预计返校日（可选）</Text>
      <Picker mode='date' value={returnDate || today()} onChange={(e) => setReturnDate(e.detail.value)}>
        <View className='input'>{returnDate || '点击选择'}</View>
      </Picker>

      <Text className='label' style={{ marginTop: '20rpx' }}>事由</Text>
      <Textarea className='input' style={{ height: '160rpx', width: 'auto' }} value={reason}
                onInput={(e) => setReason(e.detail.value)} placeholder='请说明请假原因' />

      <Text className='label' style={{ marginTop: '20rpx' }}>证明材料（图片或 PDF）</Text>
      <View className='btn-outline' onClick={chooseFile}>
        {filePath ? '已选择，点击重选' : '选择证明材料'}
      </View>

      <Button className='btn' style={{ marginTop: '28rpx' }} loading={busy} disabled={busy} onClick={submit}>
        提交
      </Button>
      <Text className='faint' style={{ display: 'block', marginTop: '16rpx', fontSize: '26rpx' }}>
        通过核查后将自动写入对应日期考勤（节假日/周五六不点名，自动跳过）。
      </Text>
    </View>
  )
}
