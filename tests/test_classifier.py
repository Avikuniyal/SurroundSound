import tensorflow as tf
import tensorflow_hub as hub
import tensorflow_io as tfio
from tensorflow.keras import layers, models

# 1. Utility function to load and preprocess audio to 16kHz Mono
@tf.function
def load_wav_16k_mono(filename):
    file_contents = tf.io.read_file(filename)
    wav, sample_rate = tf.audio.decode_wav(file_contents, desired_channels=1)
    wav = tf.squeeze(wav, axis=-1)
    sample_rate = tf.cast(sample_rate, dtype=tf.int64)
    wav = tfio.audio.resample(wav, rate_in=sample_rate, rate_out=16000)
    return wav

# 2. YAMNet Model Handle
YAMNET_HANDLE = 'https://tfhub.dev/google/yamnet/1'

# 3. Custom Classification Head Factory
def build_classifier_head():
    model = models.Sequential([
        layers.Input(shape=(1024,), dtype=tf.float32, name='embedding'),
        layers.Dense(512, activation='relu'),
        layers.Dense(1, activation='sigmoid')
    ])
    model.compile(
        loss=tf.keras.losses.BinaryCrossentropy(),
        optimizer="adam",
        metrics=['accuracy']
    )
    return model

# 4. Custom Pooling Layer for End-to-End Pipeline
class ReduceMeanLayer(tf.keras.layers.Layer):
    def __init__(self, axis=0, **kwargs):
        super().__init__(**kwargs)
        self.axis = axis

    def call(self, input_tensor):
        return tf.math.reduce_mean(input_tensor, axis=self.axis)

if __name__ == "__main__":
    print("Initializing YAMNet from TensorFlow Hub...")
    yamnet = hub.load(YAMNET_HANDLE)
    
    print("Building Classifier Head...")
    classifier = build_classifier_head()
    classifier.summary()